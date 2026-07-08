/**
 * Bitcoin deposit monitor using Blockstream API.
 *
 * Flow:
 *  1. On startup, load all pending BTC deposits from the DB.
 *  2. Poll Blockstream every POLL_INTERVAL_MS for incoming txs on each address.
 *  3. After MIN_CONFIRMATIONS, atomically credit the user balance (idempotent).
 *
 * Address derivation:
 *  - Admin sets BTC_XPUB (account-level xpub, m/84'/0'/0' for native segwit).
 *  - Each deposit derives at m/0/<index> (external chain).
 *  - The deposit address is stored in the `btc_address` column (permanent).
 *  - The on-chain txid is stored in `tx_hash` only after confirmation.
 *
 * Safety properties:
 *  - Idempotent: status transition pending → confirmed is conditional, so
 *    replay/concurrency never double-credits.
 *  - Address uniqueness: enforced by DB partial index on btc_address, plus
 *    a unique-constraint + retry loop in the route.
 *  - A single bitcoin tx paying N deposit addresses credits N users correctly
 *    because the uniqueness key is btc_address, not the on-chain txid.
 */

import * as bitcoin from 'bitcoinjs-lib'
import BIP32Factory   from 'bip32'
import * as ecc       from 'tiny-secp256k1'
import { supabase }   from '../lib/supabase'
import { emailService } from './email'
import { sendDepositConfirmedPush } from './pushNotifications'
import { decryptSetting } from '../lib/encryption'

// Initialise BIP32 with the secp256k1 implementation
const bip32 = BIP32Factory(ecc)

const BLOCKSTREAM_API   = 'https://blockstream.info/api'
const POLL_INTERVAL_MS  = 60_000          // poll every 60 s
const MIN_CONFIRMATIONS = parseInt(process.env.BTC_MIN_CONFIRMATIONS ?? '3', 10)

// ── xpub resolution (env → DB fallback) ─────────────────────────────────────

/** In-memory cache so we don't hit the DB on every poll cycle */
let cachedXpub: string | null | undefined = undefined // undefined = not yet loaded

/**
 * Return the active BTC xpub.
 * Priority: BTC_XPUB env var → system_settings DB row → null (not configured).
 * The result is cached until `clearXpubCache()` is called.
 */
export async function getXpub(): Promise<string | null> {
  if (process.env.BTC_XPUB) return process.env.BTC_XPUB

  if (cachedXpub !== undefined) return cachedXpub

  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'btc_xpub')
      .maybeSingle()
    cachedXpub = data?.value ? decryptSetting(data.value) : null
  } catch (e) {
    console.error('[BTC] Failed to load/decrypt xpub from system_settings:', e)
    cachedXpub = null
  }
  return cachedXpub as string | null
}

/** Call after saving/deleting xpub from DB so the next poll picks it up */
export function clearXpubCache() {
  cachedXpub = undefined
}

// ── Address derivation ──────────────────────────────────────────────────────

/**
 * Derive a native-segwit (P2WPKH / bech32) BTC address from an xpub or zpub.
 * Path convention: m/0/<index>  (external chain, one address per deposit).
 *
 * Sparrow Wallet exports "zpub…" for Native Segwit (P2WPKH) accounts.
 * zpub uses version bytes 0x04b24746 instead of xpub's 0x0488b21e — the
 * underlying key material is identical; we just pass the matching network
 * object so bip32.fromBase58() accepts the prefix.
 */
export function deriveBtcAddress(xpub: string, index: number): string {
  const ZPUB_NETWORK = {
    ...bitcoin.networks.bitcoin,
    bip32: {
      public:  0x04b24746,  // zpub
      private: 0x04b2430c,  // zprv
    },
  }

  const network = xpub.startsWith('zpub') ? ZPUB_NETWORK : undefined
  const node    = bip32.fromBase58(xpub, network)
  const child   = node.derive(0).derive(index)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey:  Buffer.from(child.publicKey),
    network: bitcoin.networks.bitcoin,  // always derive mainnet bech32 address
  })
  if (!address) throw new Error(`Failed to derive BTC address at index ${index}`)
  return address
}

// ── Blockstream helpers ─────────────────────────────────────────────────────

interface BlockstreamTx {
  txid:   string
  status: { confirmed: boolean; block_height?: number }
  vout:   { scriptpubkey_address?: string; value: number }[]
}

async function fetchAddressTxs(address: string): Promise<BlockstreamTx[]> {
  const { default: axios } = await import('axios')
  const res = await axios.get<BlockstreamTx[]>(
    `${BLOCKSTREAM_API}/address/${address}/txs`,
    { timeout: 10_000 },
  )
  return res.data
}

async function fetchBlockchainHeight(): Promise<number> {
  const { default: axios } = await import('axios')
  const res = await axios.get<number>(`${BLOCKSTREAM_API}/blocks/tip/height`, { timeout: 10_000 })
  return res.data
}

/** Satoshi → BTC */
function satsToBtc(sats: number): number {
  return sats / 1e8
}

// ── BTC price cache ──────────────────────────────────────────────────────────
//
// The cache is also persisted to the `system_settings` table under the key
// `btc_price_cache` so it survives server restarts. On startup the in-memory
// cache is seeded from the DB, meaning the `pending_price` retry loop can run
// immediately after a cold restart without waiting for the next CoinGecko poll.

const BTC_PRICE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const BTC_PRICE_CACHE_DB_KEY = 'btc_price_cache'

let cachedBtcPrice: number | null = null
let btcPriceCachedAt: number      = 0

/**
 * Persist the current in-memory BTC price cache to the `system_settings`
 * table so it survives server restarts. Fire-and-forget — failures are
 * logged but never thrown, so the caller's happy path is unaffected.
 */
async function persistBtcPriceCache(price: number, fetchedAt: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          key:        BTC_PRICE_CACHE_DB_KEY,
          value:      JSON.stringify({ price, fetchedAt }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
    if (error) {
      console.warn('[BTC] Failed to persist price cache to DB:', error.message)
    }
  } catch (err) {
    console.warn('[BTC] Failed to persist price cache to DB:', (err as Error).message)
  }
}

/**
 * Seed the in-memory BTC price cache from the database on startup.
 * This means a cold restart does not lose the last known price, so
 * the `pending_price` retry loop can re-price deposits immediately.
 */
export async function loadBtcPriceCacheFromDb(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', BTC_PRICE_CACHE_DB_KEY)
      .maybeSingle()

    if (error) {
      console.warn('[BTC] Could not load price cache from DB:', error.message)
      return
    }

    if (!data?.value) {
      console.log('[BTC] No persisted price cache found — will fetch fresh on first poll')
      return
    }

    const parsed: { price: number; fetchedAt: number } = JSON.parse(data.value)
    if (parsed.price > 0 && parsed.fetchedAt) {
      cachedBtcPrice   = parsed.price
      btcPriceCachedAt = parsed.fetchedAt
      const ageSec = Math.round((Date.now() - parsed.fetchedAt) / 1000)
      console.log(`[BTC] Seeded price cache from DB: ${parsed.price} (${ageSec}s old)`)
    }
  } catch (err) {
    console.warn('[BTC] Failed to parse persisted price cache:', (err as Error).message)
  }
}

/** Fetch BTC/USD price from CoinGecko, with a 5-minute in-memory cache.
 *  Returns the cached price if CoinGecko is unreachable.
 *  Returns null only when no cached value is available either.
 *
 *  Every successful fetch is also written to the `system_settings` table so
 *  the price survives a server restart (see `loadBtcPriceCacheFromDb`).
 */
async function getBtcUsdPrice(): Promise<number | null> {
  const now = Date.now()
  if (cachedBtcPrice !== null && now - btcPriceCachedAt < BTC_PRICE_CACHE_TTL_MS) {
    return cachedBtcPrice
  }

  try {
    const { default: axios } = await import('axios')
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params:  { ids: 'bitcoin', vs_currencies: 'usd' },
      timeout: 10_000,
    })
    const price: number = data['bitcoin']?.usd ?? 0
    if (price > 0) {
      cachedBtcPrice  = price
      btcPriceCachedAt = now
      // Persist to DB asynchronously — don't await to avoid slowing the caller
      persistBtcPriceCache(price, now).catch(() => {/* already logged inside */})
    }
    return price > 0 ? price : cachedBtcPrice
  } catch (e) {
    if (cachedBtcPrice !== null) {
      const ageMin = ((now - btcPriceCachedAt) / 60_000).toFixed(1)
      console.warn(`[BTC] CoinGecko unreachable — using cached price ${cachedBtcPrice} (${ageMin} min old)`)
      return cachedBtcPrice
    }
    console.warn('[BTC] CoinGecko unreachable and no cached price available')
    return null
  }
}

// ── Atomic credit ────────────────────────────────────────────────────────────
//
// Sets status pending → confirmed (conditional — safe to replay).
// Sets tx_hash to the on-chain Bitcoin txid.
// btc_address is NOT modified — it remains the permanent deposit address.

async function atomicCreditBtc(
  txId:      string,
  userId:    string,
  amountUsd: number,
  btcTxid:   string,
  fromStatuses: string[] = ['pending'],
): Promise<boolean> {
  // Transition pending[/pending_price] → confirmed. The .in('status', …)
  // guard makes this a no-op if the row was already confirmed by a prior
  // poll cycle (or already moved on by a concurrent cycle).
  const { data: updated, error: txErr } = await supabase
    .from('transactions')
    .update({ status: 'confirmed', amount_usd: amountUsd, tx_hash: btcTxid, failure_reason: null })
    .eq('id', txId)
    .in('status', fromStatuses)
    .select('id')

  if (txErr) {
    console.error('[BTC] Failed to confirm transaction:', txErr.message)
    throw txErr
  }

  if (!updated || updated.length === 0) {
    // Already confirmed by a previous poll cycle — nothing to do.
    console.log(`[BTC] Transaction ${txId} already confirmed — skipping`)
    return false
  }

  const { error: balErr } = await supabase.rpc('increment_balance', {
    p_user_id: userId,
    p_amount:  amountUsd,
  })

  if (balErr) {
    // Roll back so the next cycle can retry
    await supabase.from('transactions').update({ status: 'pending' }).eq('id', txId)
    console.error('[BTC] Balance increment failed — rolled back:', balErr.message)
    throw balErr
  }

  // Confirmation email (best-effort)
  try {
    const { data: user } = await supabase
      .from('users').select('email, full_name').eq('id', userId).single()
    if (user) await emailService.sendDepositConfirmed(user.email, user.full_name, amountUsd)
  } catch (e) {
    console.warn('[BTC] Confirmation email failed (non-fatal):', e)
  }

  // Real Web Push notification — reaches the user even if the browser is
  // fully closed, unlike the realtime-subscription-driven in-app toast.
  try {
    await sendDepositConfirmedPush(userId, amountUsd, 'btc')
  } catch (e) {
    console.warn('[BTC] Push notification failed (non-fatal):', e)
  }

  // Audit log (best-effort)
  try {
    await supabase.from('audit_logs').insert({
      user_id:   userId,
      action:    'deposit_confirmed',
      metadata:  JSON.stringify({ amountUsd, txId, btcTxid, method: 'btc' }),
      ip_address: 'blockchain',
    })
  } catch (e) {
    console.warn('[BTC] Audit log failed (non-fatal):', e)
  }

  console.log(`[BTC] Credited $${amountUsd.toFixed(2)} to user ${userId} (tx: ${txId}, btcTxid: ${btcTxid})`)
  return true
}

// ── Poll loop ───────────────────────────────────────────────────────────────

interface PendingBtcDeposit {
  id:         string
  userId:     string
  btcAddress: string   // from the dedicated btc_address column
  amountUsd:  number
  status:     string
}

async function loadPendingBtcDeposits(): Promise<PendingBtcDeposit[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, user_id, btc_address, amount_usd, status')
    .eq('method', 'btc')
    .in('status', ['pending', 'pending_price'])
    .not('btc_address', 'is', null)

  if (error) {
    console.error('[BTC] Failed to load pending deposits:', error.message)
    return []
  }

  return (data ?? []).map(row => ({
    id:         row.id,
    userId:     row.user_id,
    btcAddress: row.btc_address as string,
    amountUsd:  row.amount_usd,
    status:     row.status,
  }))
}

/**
 * Persist the current confirmation count for a still-pending BTC deposit so
 * the frontend can show "X / MIN_CONFIRMATIONS confirmations" progress. This
 * is a no-op once the deposit has moved past 'pending' (confirmed / failed /
 * pending_price), guarded by the .eq('status', 'pending') filter below.
 */
async function persistConfirmationProgress(
  depositId: string,
  txid: string,
  confirmations: number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('transactions')
      .update({
        metadata: JSON.stringify({ confirmations, btcTxid: txid, minConfirmations: MIN_CONFIRMATIONS }),
      })
      .eq('id', depositId)
      .eq('status', 'pending')
    if (error) {
      console.warn(`[BTC] Failed to persist confirmation progress for ${depositId}:`, error.message)
    }
  } catch (err) {
    console.warn(`[BTC] Failed to persist confirmation progress for ${depositId}:`, (err as Error).message)
  }
}

async function pollDeposit(deposit: PendingBtcDeposit, chainHeight: number, btcPrice: number | null): Promise<void> {
  let txs: BlockstreamTx[]
  try {
    txs = await fetchAddressTxs(deposit.btcAddress)
  } catch (e) {
    console.warn(`[BTC] Blockstream fetch failed for ${deposit.btcAddress}:`, e)
    return
  }

  // Track the best (highest-confirmation) tx that actually pays this address,
  // so we can persist progress even before MIN_CONFIRMATIONS is reached.
  let bestConfirmations = -1
  let bestTxid: string | null = null

  for (const tx of txs) {
    const confirmations = tx.status.block_height
      ? chainHeight - tx.status.block_height + 1
      : 0

    // Sum sats sent to our address in this tx
    const satsReceived = tx.vout
      .filter(o => o.scriptpubkey_address === deposit.btcAddress)
      .reduce((sum, o) => sum + o.value, 0)

    if (satsReceived <= 0) continue

    if (confirmations > bestConfirmations) {
      bestConfirmations = confirmations
      bestTxid = tx.txid
    }

    if (confirmations < MIN_CONFIRMATIONS) {
      console.log(`[BTC] ${deposit.btcAddress}: tx ${tx.txid} has ${confirmations}/${MIN_CONFIRMATIONS} confirmations`)
      // Surface progress as a failure_reason too, so the admin "Reason" column
      // shows something more useful than "—" while a deposit is still waiting
      // on-chain — mirrors the ETH listener's practice of always explaining
      // why a deposit hasn't been credited yet.
      try {
        await supabase
          .from('transactions')
          .update({ failure_reason: `Confirmation count insufficient — ${confirmations}/${MIN_CONFIRMATIONS} confirmations` })
          .eq('id', deposit.id)
          .eq('status', 'pending')
      } catch (err) {
        console.warn(`[BTC] Failed to persist confirmation-wait reason for ${deposit.id}:`, (err as Error).message)
      }
      continue
    }

    const btcAmount = satsToBtc(satsReceived)

    if (btcPrice === null) {
      // Transaction is confirmed on-chain but we can't convert to USD yet
      // (CoinGecko is down and the price cache is exhausted). Surface this
      // to the user as a distinct status rather than leaving them staring
      // at a plain "pending" deposit — it will auto-resolve once a price
      // is available on a future poll cycle.
      console.warn(
        `[BTC] ${deposit.btcAddress}: tx ${tx.txid} confirmed (${btcAmount} BTC) but BTC/USD price unavailable — marking pending_price for retry`,
      )
      const { error: deferErr } = await supabase
        .from('transactions')
        .update({
          status:         'pending_price',
          failure_reason: 'BTC price unavailable — no cache at confirmation time (will retry automatically)',
          metadata:       JSON.stringify({ btcAmount, btcTxid: tx.txid }),
        })
        .eq('id', deposit.id)
        .eq('status', 'pending') // no-op if already pending_price from a prior cycle
      if (deferErr) {
        console.error(`[BTC] Failed to mark tx ${deposit.id} as pending_price:`, deferErr.message)
      }
      return // this deposit is settled for this cycle — stop scanning txs for it
    }

    const usdValue = btcAmount * btcPrice

    if (usdValue <= 0) {
      console.warn(`[BTC] Cannot compute USD value (price=${btcPrice}) — skipping`)
      try {
        await supabase
          .from('transactions')
          .update({ failure_reason: 'BTC price returned $0 at confirmation time — use manual USD override' })
          .eq('id', deposit.id)
          .eq('status', 'pending')
      } catch (err) {
        console.warn(`[BTC] Failed to persist $0-price reason for ${deposit.id}:`, (err as Error).message)
      }
      continue
    }

    console.log(`[BTC] Confirmed: ${btcAmount} BTC (≈${usdValue.toFixed(2)}) → ${deposit.btcAddress} | txid: ${tx.txid}`)

    // atomicCreditBtc is idempotent via the status guard below. If this
    // deposit was already confirmed (e.g. a prior poll cycle), it returns
    // false and skips the balance credit. Deposits previously deferred to
    // pending_price (outage recovered) are credited here too.
    await atomicCreditBtc(deposit.id, deposit.userId, usdValue, tx.txid, ['pending', 'pending_price'])
    return // this deposit is settled — stop scanning txs for it
  }

  // Nothing reached MIN_CONFIRMATIONS this cycle — persist whatever progress
  // exists so the frontend can show "X / MIN_CONFIRMATIONS confirmations".
  if (bestTxid && bestConfirmations >= 0) {
    await persistConfirmationProgress(deposit.id, bestTxid, bestConfirmations)
  }
}

async function runPollCycle(): Promise<void> {
  // Dynamic xpub check — no-op until an admin configures the wallet
  const xpub = await getXpub()
  if (!xpub) return

  const [deposits, chainHeight, btcPrice] = await Promise.all([
    loadPendingBtcDeposits(),
    fetchBlockchainHeight().catch(() => 0),
    getBtcUsdPrice(),
  ])

  if (deposits.length === 0) return

  if (chainHeight === 0) {
    console.warn('[BTC] Could not fetch chain height — skipping poll cycle')
    return
  }

  if (btcPrice === null) {
    console.warn('[BTC] BTC/USD price unavailable (CoinGecko down, no cache) — checking confirmations only; USD credit deferred')
  }

  console.log(`[BTC] Polling ${deposits.length} pending deposit(s) | height=${chainHeight} price=${btcPrice ?? 'unavailable'}`)

  await Promise.allSettled(deposits.map(d => pollDeposit(d, chainHeight, btcPrice)))
}

// ── Public entry point ──────────────────────────────────────────────────────
//
// Design: the polling interval runs unconditionally once started.  Each
// runPollCycle() checks getXpub() dynamically so the monitor automatically
// activates when an admin saves an xpub via the UI (no restart needed) and
// becomes a no-op again if the xpub is removed.
//
// startBtcMonitor() is idempotent — safe to call multiple times (e.g. after
// saving a new xpub).  Only one interval is ever registered.

let monitorRunning = false

export function startBtcMonitor() {
  if (monitorRunning) return   // already running — nothing to do

  monitorRunning = true
  console.log(`[BTC] Monitor loop started (min ${MIN_CONFIRMATIONS} confirmations, polling every ${POLL_INTERVAL_MS / 1000}s)`)

  // Seed the in-memory price cache from the DB first so a cold restart
  // doesn't lose the last known price, then run the first poll cycle.
  loadBtcPriceCacheFromDb()
    .catch(e => console.error('[BTC] Failed to seed price cache from DB:', e))
    .finally(() => {
      runPollCycle().catch(e => console.error('[BTC] Poll cycle error:', e))
    })

  setInterval(
    () => runPollCycle().catch(e => console.error('[BTC] Poll cycle error:', e)),
    POLL_INTERVAL_MS,
  )
}
