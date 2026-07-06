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
    cachedXpub = data?.value ?? null
  } catch {
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

/** Fetch BTC/USD price from CoinGecko */
async function getBtcUsdPrice(): Promise<number> {
  const { default: axios } = await import('axios')
  const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params:  { ids: 'bitcoin', vs_currencies: 'usd' },
    timeout: 10_000,
  })
  return data['bitcoin']?.usd ?? 0
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
): Promise<boolean> {
  // Transition pending → confirmed. The .eq('status','pending') guard makes
  // this a no-op if the row was already confirmed by a prior poll cycle.
  const { data: updated, error: txErr } = await supabase
    .from('transactions')
    .update({ status: 'confirmed', amount_usd: amountUsd, tx_hash: btcTxid })
    .eq('id', txId)
    .eq('status', 'pending')
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
}

async function loadPendingBtcDeposits(): Promise<PendingBtcDeposit[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, user_id, btc_address, amount_usd')
    .eq('method', 'btc')
    .eq('status', 'pending')
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
  }))
}

async function pollDeposit(deposit: PendingBtcDeposit, chainHeight: number, btcPrice: number): Promise<void> {
  let txs: BlockstreamTx[]
  try {
    txs = await fetchAddressTxs(deposit.btcAddress)
  } catch (e) {
    console.warn(`[BTC] Blockstream fetch failed for ${deposit.btcAddress}:`, e)
    return
  }

  for (const tx of txs) {
    const confirmations = tx.status.block_height
      ? chainHeight - tx.status.block_height + 1
      : 0

    if (confirmations < MIN_CONFIRMATIONS) {
      console.log(`[BTC] ${deposit.btcAddress}: tx ${tx.txid} has ${confirmations}/${MIN_CONFIRMATIONS} confirmations`)
      continue
    }

    // Sum sats sent to our address in this tx
    const satsReceived = tx.vout
      .filter(o => o.scriptpubkey_address === deposit.btcAddress)
      .reduce((sum, o) => sum + o.value, 0)

    if (satsReceived <= 0) continue

    const btcAmount = satsToBtc(satsReceived)
    const usdValue  = btcAmount * btcPrice

    if (usdValue <= 0) {
      console.warn(`[BTC] Cannot compute USD value (price=${btcPrice}) — skipping`)
      continue
    }

    console.log(`[BTC] Confirmed: ${btcAmount} BTC (≈$${usdValue.toFixed(2)}) → ${deposit.btcAddress} | txid: ${tx.txid}`)

    // atomicCreditBtc is idempotent via the status=pending conditional update.
    // If this deposit was already confirmed (e.g. a prior poll cycle), it
    // returns false and skips the balance credit.
    await atomicCreditBtc(deposit.id, deposit.userId, usdValue, tx.txid)
    return // this deposit is settled — stop scanning txs for it
  }
}

async function runPollCycle(): Promise<void> {
  // Dynamic xpub check — no-op until an admin configures the wallet
  const xpub = await getXpub()
  if (!xpub) return

  const [deposits, chainHeight, btcPrice] = await Promise.all([
    loadPendingBtcDeposits(),
    fetchBlockchainHeight().catch(() => 0),
    getBtcUsdPrice().catch(() => 0),
  ])

  if (deposits.length === 0) return

  if (chainHeight === 0 || btcPrice === 0) {
    console.warn('[BTC] Could not fetch chain height or BTC price — skipping poll cycle')
    return
  }

  console.log(`[BTC] Polling ${deposits.length} pending deposit(s) | height=${chainHeight} price=${btcPrice}`)

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

  // Run once immediately (best-effort), then on a fixed interval.
  runPollCycle().catch(e => console.error('[BTC] Poll cycle error:', e))
  setInterval(
    () => runPollCycle().catch(e => console.error('[BTC] Poll cycle error:', e)),
    POLL_INTERVAL_MS,
  )
}
