/**
 * Ethereum blockchain monitor for fixed-address ETH/USDT/USDC deposits.
 * Watches the admin-configured deposit address(es) — see
 * `services/depositAddresses.ts` — for incoming native ETH transfers and
 * USDT/USDC ERC-20 `Transfer` events, matches them to pending transactions
 * by exact amount, and atomically credits user balances after sufficient
 * confirmations.
 *
 * Matching: since all deposits for a coin share one fixed address (unlike
 * BTC's per-user derived addresses), each pending deposit is allocated a
 * unique required amount at creation time (see `POST
 * /api/payments/create-crypto-deposit`), stored as an exact raw integer in
 * `transactions.metadata.requiredRaw`. An incoming transfer is matched to a
 * pending row only when its raw amount matches exactly.
 *
 * Safety properties:
 *  - Idempotent: uses conditional status update (pending → confirmed) so
 *    replayed events or multi-instance races never double-credit.
 *  - Finality-guarded: waits MIN_CONFIRMATIONS blocks before crediting to
 *    protect against chain reorgs.
 *  - Deduplication: processed (txHash + logIndex/native) event keys are
 *    persisted so restarts cannot replay an already-handled event.
 */

import { ethers } from 'ethers'
import { supabase } from '../lib/supabase'
import { emailService } from './email'
import { sendDepositConfirmedPush } from './pushNotifications'
import { loadActiveEvmAddressSets, type EvmCoin } from './depositAddresses'

// Minimal ABI for the ERC-20 Transfer event — used to watch USDT/USDC
export const ERC20_TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

// Known ERC-20 token contract addresses on Ethereum mainnet
export const TOKEN_MAP: Record<string, { symbol: string; decimals: number }> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
}

// How many block confirmations to wait before crediting.
// 12 is a safe default for Ethereum mainnet; override via env for testnets.
const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS ?? '12', 10)

// ── ETH price cache ────────────────────────────────────────────────────────
// Holds the last successfully fetched ETH/USD price and when it was fetched.
// Used as a fallback when CoinGecko is unreachable so in-flight deposits are
// never silently dropped due to a transient API outage.
//
// The cache is also persisted to the `system_settings` table under the key
// `eth_price_cache` so it survives server restarts.  On startup the in-memory
// cache is seeded from the DB, meaning the `pending_price` retry loop can run
// immediately after a cold restart without waiting for the next CoinGecko poll.
const ETH_PRICE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const ETH_PRICE_CACHE_DB_KEY  = 'eth_price_cache'

interface EthPriceCache {
  price:    number
  fetchedAt: number  // Date.now()
}

let ethPriceCache: EthPriceCache | null = null

/**
 * Persist the current in-memory ETH price cache to the `system_settings`
 * table so it survives server restarts.  Fire-and-forget — failures are
 * logged but never thrown, so the caller's happy path is unaffected.
 */
async function persistEthPriceCache(cache: EthPriceCache): Promise<void> {
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        { key: ETH_PRICE_CACHE_DB_KEY, value: JSON.stringify(cache), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) {
      console.warn('[Blockchain] Failed to persist ETH price cache to DB:', error.message)
    }
  } catch (err) {
    console.warn('[Blockchain] Failed to persist ETH price cache to DB:', (err as Error).message)
  }
}

/**
 * Seed the in-memory ETH price cache from the database on startup.
 * This means a cold restart does not lose the last known price, so
 * the `pending_price` retry loop can re-price deposits immediately.
 */
export async function loadEthPriceCacheFromDb(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', ETH_PRICE_CACHE_DB_KEY)
      .maybeSingle()

    if (error) {
      console.warn('[Blockchain] Could not load ETH price cache from DB:', error.message)
      return
    }

    if (!data?.value) {
      console.log('[Blockchain] No persisted ETH price cache found — will fetch fresh on first deposit')
      return
    }

    const parsed: EthPriceCache = JSON.parse(data.value)
    if (parsed.price > 0 && parsed.fetchedAt) {
      ethPriceCache = parsed
      const ageSec = Math.round((Date.now() - parsed.fetchedAt) / 1000)
      console.log(`[Blockchain] Seeded ETH price cache from DB: ${parsed.price} (${ageSec}s old)`)
    }
  } catch (err) {
    console.warn('[Blockchain] Failed to parse persisted ETH price cache:', (err as Error).message)
  }
}

/**
 * Fetch the current ETH/USD price from CoinGecko, caching the result for
 * ETH_PRICE_CACHE_TTL_MS.  On failure, returns the cached price (even if
 * stale) so in-flight deposits survive a transient outage.  Returns null
 * only when no price has ever been successfully fetched.
 *
 * Every successful fetch is also written to the `system_settings` table so
 * the price survives a server restart (see `loadEthPriceCacheFromDb`).
 */
export async function fetchEthUsdPrice(): Promise<number | null> {
  // Return cache if still fresh
  if (ethPriceCache && Date.now() - ethPriceCache.fetchedAt < ETH_PRICE_CACHE_TTL_MS) {
    return ethPriceCache.price
  }

  try {
    const { default: axios } = await import('axios')
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params:  { ids: 'ethereum', vs_currencies: 'usd' },
      timeout: 8000,
    })
    const price: number = data['ethereum']?.usd ?? 0
    if (price > 0) {
      const newCache: EthPriceCache = { price, fetchedAt: Date.now() }
      ethPriceCache = newCache
      // Persist to DB asynchronously — don't await to avoid slowing the caller
      persistEthPriceCache(newCache).catch(() => {/* already logged inside */})
      return price
    }
    // CoinGecko returned 0 — treat as failure, fall through to stale cache
    console.warn('[Blockchain] CoinGecko returned 0 for ETH price — using stale cache if available')
  } catch (err) {
    console.error('[Blockchain] Failed to fetch ETH price from CoinGecko:', (err as Error).message)
  }

  // On failure, use stale cache (any age) rather than dropping the deposit
  if (ethPriceCache) {
    const staleAgeSec = Math.round((Date.now() - ethPriceCache.fetchedAt) / 1000)
    console.warn(`[Blockchain] Using stale ETH price ${ethPriceCache.price} (${staleAgeSec}s old) as fallback`)
    return ethPriceCache.price
  }

  // No cache at all — caller must handle the missing price
  return null
}

// How old the cached ETH price can be before admins should be warned that the
// live feed may be down. Independent from ETH_PRICE_CACHE_TTL_MS (which only
// controls when we re-fetch) so ops can tune the warning threshold separately.
const ETH_PRICE_STALE_THRESHOLD_MS =
  parseInt(process.env.ETH_PRICE_STALE_THRESHOLD_MS ?? String(15 * 60 * 1000), 10)

export interface EthPriceStatus {
  price:         number | null  // last known ETH/USD price, or null if never fetched
  fetchedAt:     string | null  // ISO timestamp of the last successful live fetch
  ageSec:        number | null  // seconds since that fetch
  stale:         boolean        // true once age exceeds ETH_PRICE_STALE_THRESHOLD_MS
  staleThresholdSec: number     // threshold used, for display purposes
}

/**
 * Returns a snapshot of the ETH/USD price cache for the admin dashboard —
 * the price, when it was last fetched live from CoinGecko, and whether it
 * has gone stale. Does not trigger a new fetch.
 */
export function getEthPriceStatus(): EthPriceStatus {
  const staleThresholdSec = Math.round(ETH_PRICE_STALE_THRESHOLD_MS / 1000)

  if (!ethPriceCache) {
    return {
      price: null,
      fetchedAt: null,
      ageSec: null,
      stale: true,
      staleThresholdSec,
    }
  }

  const ageMs = Date.now() - ethPriceCache.fetchedAt
  return {
    price:     ethPriceCache.price,
    fetchedAt: new Date(ethPriceCache.fetchedAt).toISOString(),
    ageSec:    Math.round(ageMs / 1000),
    stale:     ageMs > ETH_PRICE_STALE_THRESHOLD_MS,
    staleThresholdSec,
  }
}

/**
 * Atomically transitions a transaction from pending → confirmed and credits
 * the user's balance in a single conditional update.
 *
 * Returns true if credit was applied, false if the transaction was already
 * confirmed (idempotent — safe to call multiple times).
 */
export interface AuditOverride {
  action:  string          // replaces 'deposit_confirmed' in audit_logs
  source:  string          // e.g. 'admin_retry'
  mode:    'manual' | 'chain'
  adminId: string          // UUID of the acting admin
  ip?:     string          // request IP, if available
}

export async function atomicCredit(
  txId:          string,
  userId:        string,
  amountUsd:     number,
  txHash:        string,
  eventKey:      string,         // `${txHash}:${logIndex}` — uniqueness guard
  fromStatuses:  string[] = ['pending'],  // statuses eligible for transition
  auditOverride?: AuditOverride, // when set, writes a distinct audit entry for admin actions
): Promise<boolean> {
  // 1. Transition status → confirmed.
  //    The .in('status', fromStatuses) guard makes this a no-op on replay.
  const { data: updated, error: txErr } = await supabase
    .from('transactions')
    .update({ status: 'confirmed', amount_usd: amountUsd, tx_hash: txHash, failure_reason: null })
    .eq('id', txId)
    .in('status', fromStatuses)  // ← conditional: only update once
    .select('id')

  if (txErr) {
    console.error('[Blockchain] Failed to confirm transaction:', txErr.message)
    throw txErr
  }

  if (!updated || updated.length === 0) {
    // Already confirmed by a previous run — skip balance update
    console.log(`[Blockchain] Transaction ${txId} already confirmed — skipping (event: ${eventKey})`)
    return false
  }

  // 2. Increment balance atomically using Postgres addition.
  //    Using .rpc() avoids a read-modify-write race between concurrent instances.
  const { error: balErr } = await supabase.rpc('increment_balance', {
    p_user_id: userId,
    p_amount:  amountUsd,
  })

  if (balErr) {
    // Roll back the status update so the event can be retried
    await supabase
      .from('transactions')
      .update({ status: 'pending' })
      .eq('id', txId)
    console.error('[Blockchain] Balance increment failed — rolled back tx status:', balErr.message)
    throw balErr
  }

  // 3. Confirmation email + audit log (best-effort — don't roll back on failure)
  try {
    const { data: user } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (user) {
      await emailService.sendDepositConfirmed(user.email, user.full_name, amountUsd)
    }
  } catch (e) {
    console.warn('[Blockchain] Confirmation email failed (non-fatal):', e)
  }

  // 3b. Real Web Push notification — reaches the user even if the browser is
  // fully closed, unlike the realtime-subscription-driven in-app toast.
  try {
    await sendDepositConfirmedPush(userId, amountUsd, 'eth')
  } catch (e) {
    console.warn('[Blockchain] Push notification failed (non-fatal):', e)
  }

  try {
    if (auditOverride) {
      await supabase.from('audit_logs').insert({
        user_id:    userId,
        action:     auditOverride.action,
        metadata:   JSON.stringify({
          amountUsd,
          txId,
          txHash,
          eventKey,
          source:  auditOverride.source,
          mode:    auditOverride.mode,
          adminId: auditOverride.adminId,
        }),
        ip_address: auditOverride.ip ?? 'admin',
      })
    } else {
      await supabase.from('audit_logs').insert({
        user_id:    userId,
        action:     'deposit_confirmed',
        metadata:   JSON.stringify({ amountUsd, txId, txHash, eventKey }),
        ip_address: 'blockchain',
      })
    }
  } catch (e) {
    console.warn('[Blockchain] Audit log failed (non-fatal):', e)
  }

  // 4. Admin override notification (best-effort — don't roll back on failure)
  if (auditOverride) {
    try {
      const { data: admin } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', auditOverride.adminId)
        .single()

      await emailService.sendAdminOverrideAlert({
        amountUsd,
        adminName: admin?.full_name ?? admin?.email ?? auditOverride.adminId,
        mode:      auditOverride.mode,
        txId,
      })
    } catch (e) {
      console.warn('[Blockchain] Admin override alert email failed (non-fatal):', e)
    }
  }

  console.log(`[Blockchain] Credited ${amountUsd} to user ${userId} (tx: ${txId}, event: ${eventKey})`)
  return true
}

/**
 * Convert a raw on-chain amount to its USD value.
 *
 * Returns null (instead of 0) when the ETH price cannot be determined —
 * the caller is responsible for deferring the credit rather than dropping it.
 */
export async function getUsdValue(
  token:     string,
  rawAmount: bigint,
  decimals:  number,
): Promise<number | null> {
  const isStablecoin = token !== 'ETH'

  if (isStablecoin) {
    return Number(rawAmount) / 10 ** decimals
  }

  const price = await fetchEthUsdPrice()
  if (price === null) {
    return null
  }

  const amount = Number(rawAmount) / 1e18
  return amount * price
}

/**
 * Verifies a user-supplied on-chain transaction hash for the admin manual
 * retry path (`POST /api/admin/deposits/:id/retry`). Checks that the tx:
 *  - has reached MIN_CONFIRMATIONS and did not revert,
 *  - pays one of the currently-active deposit addresses for the given coin
 *    (native ETH transfer, or an ERC-20 Transfer for USDT/USDC),
 * and returns the raw value and computed USD amount for the caller to
 * credit. Independent of the live block/Transfer watchers — used only for
 * manually re-checking a specific transaction an admin points at.
 */
export async function verifyEvmTransaction(
  coin:        EvmCoin,
  txHash:      string,
  expectedRaw: bigint,  // the specific deposit's allocated match_amount, in raw units — must match exactly
): Promise<{ usdValue: number; rawAmount: string } | { error: string }> {
  const rpcUrl = process.env.ETH_RPC_URL
  if (!rpcUrl) return { error: 'ETH_RPC_URL not configured' }

  const addressSets = await loadActiveEvmAddressSets()
  const activeAddresses = addressSets[coin]
  if (activeAddresses.size === 0) {
    return { error: `No active ${coin.toUpperCase()} deposit address configured` }
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS, 60_000)
  if (!receipt)             return { error: 'Transaction not found on chain — check the hash' }
  if (receipt.status !== 1) return { error: 'Transaction reverted on chain — cannot credit' }

  if (coin === 'eth') {
    const tx = await provider.getTransaction(txHash)
    if (!tx || !tx.to || !activeAddresses.has(tx.to.toLowerCase())) {
      return { error: 'Transaction does not pay the active ETH deposit address' }
    }
    if (tx.value !== expectedRaw) {
      return { error: `Amount mismatch — this transaction sent ${ethers.formatEther(tx.value)} ETH, but this deposit requires exactly ${ethers.formatEther(expectedRaw)} ETH. Wrong transaction hash?` }
    }
    const usdValue = await getUsdValue('ETH', tx.value, 18)
    if (usdValue === null || usdValue <= 0) return { error: 'ETH price unavailable or returned $0 — use manual amountUsd override instead' }
    return { usdValue, rawAmount: tx.value.toString() }
  }

  // USDT/USDC: find a matching Transfer log paying an active address with the exact expected amount
  const iface = new ethers.Interface(ERC20_TRANSFER_ABI)
  const tokenInfo = Object.entries(TOKEN_MAP).find(([, info]) => info.symbol.toLowerCase() === coin)
  if (!tokenInfo) return { error: `Unknown token for coin ${coin}` }
  const [tokenAddress] = tokenInfo

  let sawTransferToActiveAddress = false
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddress) continue
    try {
      const desc = iface.parseLog({ topics: [...log.topics], data: log.data })
      if (desc && desc.name === 'Transfer' && activeAddresses.has((desc.args[1] as string).toLowerCase())) {
        sawTransferToActiveAddress = true
        const rawValue = desc.args[2] as bigint
        if (rawValue !== expectedRaw) continue // amount doesn't match this deposit — keep looking, then fall through to error
        const usdValue = Number(rawValue) / 1e6
        if (usdValue <= 0) return { error: `${coin.toUpperCase()} transfer amount is $0` }
        return { usdValue, rawAmount: rawValue.toString() }
      }
    } catch { /* not our event signature */ }
  }

  if (sawTransferToActiveAddress) {
    return { error: `This transaction pays the active ${coin.toUpperCase()} deposit address, but not the exact amount required by this deposit. Wrong transaction hash?` }
  }
  return { error: `No ${coin.toUpperCase()} Transfer to the active deposit address found in this transaction` }
}

// ── Listener health state ──────────────────────────────────────────────────
// Exported so the /health endpoint can surface real-time status.

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface ListenerStatus {
  active:              boolean        // true while the listener is configured and running
  lastEventAt:         string | null  // ISO timestamp of last PaymentReceived event
  lastCheckedAt:       string | null  // ISO timestamp of last health probe
  healthy:             boolean        // false only on confirmed provider/contract failure
  silenceSec:          number | null  // seconds since last event — informational, not a failure signal
  silenceWarning:      boolean        // true when silence exceeds threshold but provider is still healthy
  reconnecting:        boolean        // true while a reconnect attempt is in progress
  reconnectAttempts:   number         // how many reconnect attempts have been made since last success
  circuitState:        CircuitState   // closed (normal) / open (suppressing reconnects) / half_open (trial reconnect)
  consecutiveFailures: number         // consecutive reconnect-cycle failures since the circuit last closed
  circuitCooldownRemainingSec: number | null  // seconds left before a half-open trial is allowed, if open
  message:             string         // human-readable status description
  lastRetryRunAt:      string | null  // ISO timestamp of the last pending-price retry loop run
}

const listenerState = {
  active:              false,
  lastEventAt:         null as number | null,  // Date.now() of last event
  startedAt:           null as number | null,
  lastCheckedAt:       null as number | null,
  healthy:             true,
  lastAlertAt:         null as number | null,  // Date.now() of last admin alert sent
  reconnecting:        false,
  reconnectAttempts:   0,
  lastReconnectAt:     null as number | null,
  lastRetryRunAt:      null as number | null,  // Date.now() of the last retryPendingPriceTransactions run
  // Circuit breaker — replaces the plain boolean mutex so repeated/flapping
  // failures are handled as an explicit state machine instead of ad-hoc flag
  // resets scattered across success/failure callbacks.
  circuitState:        'closed' as CircuitState,
  consecutiveFailures: 0,
  circuitOpenedAt:     null as number | null,
  // True only while a reconnectWithBackoff() call is actively executing.
  // Serializes reconnect sequences: unlike `reconnecting` (which is also
  // touched by the event handler for display purposes), this is the actual
  // mutex, so concurrent error events can never spawn parallel backoff loops.
  reconnectInFlight:   false,
}

// Tracks the currently active provider/token-contract instances so listeners
// can be removed before a new set is attached on reconnect.
let activeProvider:       ethers.JsonRpcProvider | null = null
let activeTokenContracts: ethers.Contract[]             = []

// The exact set of addresses each token's Transfer filter is currently bound
// to. Used to detect when an admin adds/removes/deactivates a deposit
// address so the filter can be rebuilt — otherwise a newly-activated address
// would silently receive no events until the next process restart.
let boundTokenAddressSets: Partial<Record<EvmCoin, Set<string>>> = {}

function sameAddressSet(a: Set<string> | undefined, b: Set<string>): boolean {
  if (!a || a.size !== b.size) return false
  for (const addr of a) if (!b.has(addr)) return false
  return true
}

/** A live event firing proves the RPC connection is healthy. */
function markProviderAlive(): void {
  listenerState.healthy = true
  closeCircuit()
}

// How long with no events before we consider the listener stalled.
// Mainnet blocks arrive every ~12 s, so 10 min with zero events is suspicious.
// Set LISTENER_SILENCE_THRESHOLD_MS in env to override (useful on testnets).
const LISTENER_SILENCE_THRESHOLD_MS =
  parseInt(process.env.LISTENER_SILENCE_THRESHOLD_MS ?? String(10 * 60 * 1000), 10)

// How often to run the health probe.
const LISTENER_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

// Minimum gap between admin alert emails (avoid inbox flooding).
const ALERT_COOLDOWN_MS = 60 * 60 * 1000  // 1 hour

/**
 * Sends an admin alert email when the listener has transitioned to
 * healthy: false, rate-limited by ALERT_COOLDOWN_MS so a flapping provider
 * or a health check that keeps re-confirming the failure every 5 minutes
 * cannot flood admin inboxes.
 */
async function maybeSendUnhealthyAlert(reason: string): Promise<void> {
  const now       = Date.now()
  const cooldownOk =
    listenerState.lastAlertAt === null ||
    now - listenerState.lastAlertAt > ALERT_COOLDOWN_MS

  if (!cooldownOk) return

  listenerState.lastAlertAt = now

  const status  = getListenerStatus()
  const details =
    `Current status: ${status.message}\n` +
    `Last event at: ${status.lastEventAt ?? 'never'}\n` +
    `Last checked at: ${status.lastCheckedAt ?? 'n/a'}\n` +
    `Reconnect attempts: ${status.reconnectAttempts}\n` +
    `Admin dashboard: ${process.env.FRONTEND_URL}/admin`

  try {
    await emailService.sendListenerAlert(reason, details)
    console.warn('[Blockchain] Admin alert email sent:', reason)
  } catch (alertErr) {
    console.error('[Blockchain] Failed to send admin alert email:', (alertErr as Error).message)
  }
}

/**
 * Returns a snapshot of the blockchain listener's health for external monitors.
 *
 * `healthy` is false only when the RPC provider or contract is unreachable —
 * genuine connection failures that prevent events from being processed.
 * Event silence alone (no PaymentReceived in a while) is normal during low
 * traffic and is exposed only as `silenceWarning` for informational purposes.
 */
export function getListenerStatus(): ListenerStatus {
  if (!listenerState.active) {
    return {
      active:            false,
      lastEventAt:       null,
      lastCheckedAt:     null,
      healthy:           true,   // "not configured" is not an error state
      silenceSec:        null,
      silenceWarning:    false,
      reconnecting:      false,
      reconnectAttempts: 0,
      circuitState:      'closed',
      consecutiveFailures: 0,
      circuitCooldownRemainingSec: null,
      message:           'Listener not configured (ETH_RPC_URL missing, or no active deposit address configured)',
      lastRetryRunAt:    listenerState.lastRetryRunAt
        ? new Date(listenerState.lastRetryRunAt).toISOString()
        : null,
    }
  }

  const now        = Date.now()
  const silenceSec = listenerState.lastEventAt
    ? Math.round((now - listenerState.lastEventAt) / 1000)
    : listenerState.startedAt
      ? Math.round((now - listenerState.startedAt!) / 1000)
      : null

  // Silence warning: threshold exceeded — but only after the startup grace period
  const pastGrace =
    listenerState.startedAt !== null &&
    now - listenerState.startedAt > LISTENER_SILENCE_THRESHOLD_MS

  const silenceWarning =
    pastGrace &&
    silenceSec !== null &&
    silenceSec * 1000 > LISTENER_SILENCE_THRESHOLD_MS

  const cooldownRemainingSec =
    listenerState.circuitState === 'open' && listenerState.circuitOpenedAt !== null
      ? Math.max(0, Math.round((CIRCUIT_OPEN_COOLDOWN_MS - (now - listenerState.circuitOpenedAt)) / 1000))
      : null

  let message: string
  if (listenerState.circuitState === 'open') {
    message = `Circuit breaker OPEN after ${listenerState.consecutiveFailures} consecutive failures — reconnects suppressed for ${cooldownRemainingSec}s`
  } else if (listenerState.circuitState === 'half_open') {
    message = 'Circuit breaker HALF_OPEN — attempting a trial reconnect'
  } else if (listenerState.reconnecting) {
    message = `Reconnecting to provider (attempt ${listenerState.reconnectAttempts} with exponential backoff)…`
  } else if (!listenerState.healthy) {
    message = 'Provider unreachable or contract not found — check RPC connection'
  } else if (silenceWarning) {
    const silenceMin = Math.round(silenceSec! / 60)
    message = `Provider healthy — no events for ${silenceMin} min (normal if no deposits)`
  } else {
    message = 'Listener healthy'
  }

  return {
    active:            true,
    lastEventAt:       listenerState.lastEventAt
      ? new Date(listenerState.lastEventAt).toISOString()
      : null,
    lastCheckedAt:     listenerState.lastCheckedAt
      ? new Date(listenerState.lastCheckedAt).toISOString()
      : null,
    healthy:           listenerState.healthy,
    silenceSec,
    silenceWarning,
    reconnecting:      listenerState.reconnecting,
    reconnectAttempts: listenerState.reconnectAttempts,
    circuitState:      listenerState.circuitState,
    consecutiveFailures: listenerState.consecutiveFailures,
    circuitCooldownRemainingSec: cooldownRemainingSec,
    message,
    lastRetryRunAt:    listenerState.lastRetryRunAt
      ? new Date(listenerState.lastRetryRunAt).toISOString()
      : null,
  }
}

// ── Circuit breaker helpers ─────────────────────────────────────────────────
// Consecutive-failure threshold before we stop attempting reconnects
// altogether for a cooldown period. Protects against a flapping provider
// causing an unbounded stream of reconnect cycles.
const CIRCUIT_FAILURE_THRESHOLD =
  parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD ?? '3', 10)

// How long the circuit stays OPEN (reconnects fully suppressed) before a
// single HALF_OPEN trial reconnect is allowed.
const CIRCUIT_OPEN_COOLDOWN_MS =
  parseInt(process.env.CIRCUIT_OPEN_COOLDOWN_MS ?? String(5 * 60 * 1000), 10)

/**
 * Confirms the provider is fully working again (either a live event was
 * processed or a reconnect/health-check succeeded) and resets the circuit
 * back to CLOSED.
 */
function closeCircuit(): void {
  if (listenerState.circuitState !== 'closed') {
    console.log(
      `[Blockchain] Circuit breaker CLOSED — provider recovered after ${listenerState.consecutiveFailures} consecutive failure(s)`,
    )
  }
  listenerState.circuitState        = 'closed'
  listenerState.consecutiveFailures = 0
  listenerState.circuitOpenedAt     = null
  listenerState.reconnectAttempts   = 0
}

/**
 * Records a connectivity failure (provider error or failed health check).
 * Once CIRCUIT_FAILURE_THRESHOLD consecutive failures accumulate, the
 * circuit trips OPEN and reconnect attempts are suppressed until the
 * cooldown elapses. A failed HALF_OPEN trial reconnect re-opens the circuit
 * and restarts the cooldown.
 */
function recordCircuitFailure(): void {
  listenerState.consecutiveFailures += 1

  if (listenerState.circuitState === 'half_open') {
    listenerState.circuitState    = 'open'
    listenerState.circuitOpenedAt = Date.now()
    console.error('[Blockchain] Circuit breaker: trial reconnect failed — re-opening, cooldown restarted')
    return
  }

  if (listenerState.circuitState === 'closed' && listenerState.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    listenerState.circuitState    = 'open'
    listenerState.circuitOpenedAt = Date.now()
    console.error(
      `[Blockchain] Circuit breaker OPEN after ${listenerState.consecutiveFailures} consecutive failures — ` +
      `suppressing reconnects for ${Math.round(CIRCUIT_OPEN_COOLDOWN_MS / 1000)}s`,
    )
  }
}

// ── Reconnect configuration ────────────────────────────────────────────────
// Exponential backoff delays for reconnect attempts (ms).
// After MAX_RECONNECT_ATTEMPTS the listener gives up and sends an alert.
const RECONNECT_BACKOFF_MS    = [5_000, 10_000, 30_000, 60_000, 60_000]
const MAX_RECONNECT_ATTEMPTS  = RECONNECT_BACKOFF_MS.length

/**
 * Finds the pending deposit (for the given coin) whose allocated exact
 * amount matches the raw on-chain value, by scanning `metadata.requiredRaw`
 * on pending rows for that method. Volumes are low enough that an in-memory
 * scan per candidate transfer is fine — no index needed.
 */
async function matchPendingEvmDeposit(
  coin:      EvmCoin,
  rawValue:  bigint,
): Promise<{ id: string; user_id: string } | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, user_id, metadata')
    .eq('method', coin)
    .eq('status', 'pending')

  if (error) {
    console.error(`[Blockchain] Failed to load pending ${coin} deposits for matching:`, error.message)
    return null
  }

  for (const row of data ?? []) {
    try {
      const meta = JSON.parse(row.metadata ?? '{}')
      if (meta.requiredRaw && BigInt(meta.requiredRaw) === rawValue) {
        return { id: row.id, user_id: row.user_id }
      }
    } catch {
      // malformed metadata — skip
    }
  }
  return null
}

/** Marks a pending deposit as deferred until the price feed recovers. */
async function deferEvmDepositToPendingPrice(
  txId: string,
  meta: { rawAmount: string; token: string; txHash: string; eventKey: string },
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      status:         'pending_price',
      failure_reason: 'ETH price unavailable — no cache at confirmation time (retry loop will re-price)',
      metadata:       JSON.stringify(meta),
    })
    .eq('id', txId)
    .eq('status', 'pending')

  if (error) {
    console.error(
      `[Blockchain] CRITICAL: could not defer tx ${txId} to pending_price — ` +
      `deposit may require manual admin credit. Error: ${error.message}`,
    )
  } else {
    console.log(`[Blockchain] Tx ${txId} deferred to pending_price — retry loop will credit it when price recovers`)
  }
}

/** Processes a candidate native-ETH transfer to the configured deposit address. */
async function processNativeCandidate(
  provider:  ethers.JsonRpcProvider,
  txHash:    string,
  rawValue:  bigint,
): Promise<void> {
  const eventKey = `${txHash}:native`
  console.log(`[Blockchain] Candidate ETH deposit tx=${txHash} amount=${ethers.formatEther(rawValue)} — waiting ${MIN_CONFIRMATIONS} confirmations…`)

  const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS)
  if (!receipt || receipt.status !== 1) {
    console.warn(`[Blockchain] ETH tx ${txHash} ${receipt ? 'reverted' : 'not found'} — skipping`)
    return
  }

  const txRecord = await matchPendingEvmDeposit('eth', rawValue)
  if (!txRecord) {
    console.warn(`[Blockchain] No pending ETH deposit matches amount ${ethers.formatEther(rawValue)} (tx ${txHash})`)
    return
  }

  const usdValue = await getUsdValue('ETH', rawValue, 18)
  if (usdValue === null) {
    await deferEvmDepositToPendingPrice(txRecord.id, {
      rawAmount: rawValue.toString(), token: 'ETH', txHash, eventKey,
    })
    return
  }
  if (usdValue <= 0) {
    console.warn(`[Blockchain] USD value is 0 for ETH tx ${txHash} — skipping credit`)
    await supabase
      .from('transactions')
      .update({ failure_reason: 'ETH price returned $0 at confirmation time — use manual USD override' })
      .eq('id', txRecord.id)
      .eq('status', 'pending')
    return
  }

  await atomicCredit(txRecord.id, txRecord.user_id, usdValue, txHash, eventKey)
}

/** Scans a newly-arrived block for native ETH transfers to the active deposit address. */
async function handleNewBlock(provider: ethers.JsonRpcProvider, blockNumber: number): Promise<void> {
  markProviderAlive()

  const addressSets = await loadActiveEvmAddressSets()
  if (addressSets.eth.size === 0) return // ETH deposits not active

  const block = await provider.getBlock(blockNumber, true)
  if (!block) return

  for (const tx of block.prefetchedTransactions) {
    if (!tx.to || tx.value === 0n) continue
    if (!addressSets.eth.has(tx.to.toLowerCase())) continue

    listenerState.lastEventAt = Date.now()
    processNativeCandidate(provider, tx.hash, tx.value).catch(err =>
      console.error(`[Blockchain] Error processing native ETH candidate ${tx.hash}:`, err),
    )
  }
}

/** Processes a candidate USDT/USDC Transfer event to the configured deposit address. */
async function handleTokenTransfer(
  coin:      EvmCoin,
  to:        string,
  rawValue:  bigint,
  event:     ethers.EventLog,
): Promise<void> {
  markProviderAlive()

  const addressSets = await loadActiveEvmAddressSets()
  if (!addressSets[coin].has(to.toLowerCase())) return

  const provider = activeProvider
  if (!provider) return

  listenerState.lastEventAt = Date.now()

  const txHash   = event.transactionHash
  const eventKey = `${txHash}:${event.index}`
  console.log(`[Blockchain] Candidate ${coin.toUpperCase()} deposit tx=${txHash} amount=${Number(rawValue) / 1e6} — waiting ${MIN_CONFIRMATIONS} confirmations…`)

  const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS)
  if (!receipt || receipt.status !== 1) {
    console.warn(`[Blockchain] ${coin.toUpperCase()} tx ${txHash} ${receipt ? 'reverted' : 'not found'} — skipping`)
    return
  }

  const txRecord = await matchPendingEvmDeposit(coin, rawValue)
  if (!txRecord) {
    console.warn(`[Blockchain] No pending ${coin.toUpperCase()} deposit matches amount ${Number(rawValue) / 1e6} (tx ${txHash})`)
    return
  }

  // Stablecoins are 1:1 with USD — no price feed needed.
  const usdValue = Number(rawValue) / 1e6
  if (usdValue <= 0) {
    console.warn(`[Blockchain] USD value is 0 for ${coin.toUpperCase()} tx ${txHash} — skipping credit`)
    return
  }

  await atomicCredit(txRecord.id, txRecord.user_id, usdValue, txHash, eventKey)
}

/**
 * Attach the block + Transfer-event watchers to a provider instance.
 * Extracted so it can be called on initial start, on every reconnect, and
 * whenever the active deposit-address set changes (see
 * `maybeRebindDepositWatchers`).
 *
 * Removes all listeners from the previously active provider/contracts first
 * so old handlers do not accumulate and process events twice after a
 * reconnect or rebind.
 *
 * Each token's Transfer listener is bound with an indexed-`to` filter
 * scoped to only the currently active deposit address(es) for that coin —
 * NOT a bare `contract.on('Transfer', ...)`, which would subscribe to every
 * Transfer emitted by USDT/USDC globally (extremely high volume on mainnet)
 * and run DB/confirmation work per unrelated transfer. A token with no
 * active address gets no listener at all.
 */
async function attachDepositWatchers(provider: ethers.JsonRpcProvider): Promise<void> {
  if (activeProvider && activeProvider !== provider) {
    try { activeProvider.removeAllListeners() } catch { /* old provider may already be dead */ }
  }
  for (const contract of activeTokenContracts) {
    try { contract.removeAllListeners() } catch { /* ignore */ }
  }

  activeProvider       = provider
  activeTokenContracts = []

  // Native ETH deposits: scan every new block for txs paying an active address.
  provider.on('block', (blockNumber: number) => {
    handleNewBlock(provider, blockNumber).catch(err =>
      console.error(`[Blockchain] Error handling block ${blockNumber}:`, err),
    )
  })

  // USDT/USDC deposits: watch Transfer events on each token contract,
  // filtered server-side (via the RPC's log filter) to only the active
  // deposit address(es) for that coin.
  const addressSets = await loadActiveEvmAddressSets()
  boundTokenAddressSets = {}

  for (const [tokenAddress, info] of Object.entries(TOKEN_MAP)) {
    const coin      = info.symbol.toLowerCase() as EvmCoin
    const addresses = addressSets[coin]
    boundTokenAddressSets[coin] = new Set(addresses)
    if (addresses.size === 0) continue // no active address for this coin — don't subscribe at all

    const contract = new ethers.Contract(tokenAddress, ERC20_TRANSFER_ABI, provider)
    const filter   = contract.filters.Transfer(null, Array.from(addresses))
    contract.on(filter, (_from: string, to: string, value: bigint, event: ethers.EventLog) => {
      handleTokenTransfer(coin, to, value, event).catch(err =>
        console.error(`[Blockchain] Error handling ${coin.toUpperCase()} Transfer event:`, err),
      )
    })
    activeTokenContracts.push(contract)
  }
}

/**
 * Re-checks the active deposit-address configuration and rebuilds the
 * Transfer-event filters if it changed (address added/removed/deactivated
 * on the admin Deposit Addresses page). Called from the periodic listener
 * health check so config changes take effect without a backend restart,
 * without re-subscribing on every single event.
 */
async function maybeRebindDepositWatchers(provider: ethers.JsonRpcProvider): Promise<void> {
  const addressSets = await loadActiveEvmAddressSets()
  const changed = (Object.keys(TOKEN_MAP).length > 0) && (['usdt', 'usdc'] as EvmCoin[]).some(
    coin => !sameAddressSet(boundTokenAddressSets[coin], addressSets[coin]),
  )
  if (!changed) return

  console.log('[Blockchain] Active deposit address configuration changed — rebinding Transfer filters')
  await attachDepositWatchers(provider)
}

/**
 * Attempt to rebuild the provider and re-attach the contract event listener
 * using exponential backoff.  Called when a provider error is detected or the
 * periodic health check confirms the connection is broken.
 *
 * Serialization: `listenerState.reconnectInFlight` is a dedicated mutex set
 * only inside this function (unlike the old `reconnecting` flag, which was
 * also reset by the event handler on every successful event — that let a
 * stray success mid-cycle clear the guard and allow a second, overlapping
 * reconnect sequence to start from a concurrent error/health-check trigger).
 * With the mutex isolated here, however many error events fire in quick
 * succession, only one backoff loop ever runs at a time.
 *
 * Circuit breaker: on top of the mutex, a CLOSED/OPEN/HALF_OPEN state machine
 * (see `recordCircuitFailure` / `closeCircuit`) tracks consecutive failed
 * reconnect cycles. Once OPEN, reconnect attempts are suppressed entirely
 * for a cooldown window instead of immediately retrying — this is what
 * actually stops a flapping provider from causing a reconnect storm, since
 * without it a provider that fails right after every successful reconnect
 * would otherwise trigger a fresh multi-attempt backoff cycle every time.
 */
async function reconnectWithBackoff(rpcUrl: string): Promise<void> {
  if (listenerState.reconnectInFlight) {
    // A reconnect sequence is already running — don't start another
    return
  }

  if (listenerState.circuitState === 'open') {
    const elapsed = Date.now() - (listenerState.circuitOpenedAt ?? 0)
    if (elapsed < CIRCUIT_OPEN_COOLDOWN_MS) {
      // Still cooling down — suppress this trigger entirely
      return
    }
    // Cooldown elapsed — allow exactly one trial reconnect
    listenerState.circuitState = 'half_open'
    console.log('[Blockchain] Circuit breaker HALF_OPEN — attempting trial reconnect')
  }

  listenerState.reconnectInFlight = true
  listenerState.reconnecting      = true
  // Reset the per-outage budget so exhausted state from a previous cycle
  // never blocks future reconnection attempts.
  listenerState.reconnectAttempts = 0

  try {
    while (listenerState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const attempt  = listenerState.reconnectAttempts + 1
      const delayMs  = RECONNECT_BACKOFF_MS[listenerState.reconnectAttempts]
      listenerState.reconnectAttempts = attempt
      listenerState.lastReconnectAt   = Date.now()

      console.log(`[Blockchain] Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs / 1000}s… (circuit: ${listenerState.circuitState})`)

      await new Promise<void>(resolve => setTimeout(resolve, delayMs))

      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl)

        // Quick connectivity check before attaching a full listener
        await provider.getBlockNumber()

        await attachDepositWatchers(provider)

        // Re-arm the provider error handler for this new provider instance
        provider.on('error', (err: Error) => {
          console.error('[Blockchain] Provider error (post-reconnect):', err.message)
          listenerState.healthy = false
          recordCircuitFailure()
          maybeSendUnhealthyAlert(`Provider error: ${err.message}`).catch(console.error)
          reconnectWithBackoff(rpcUrl).catch(console.error)
        })

        listenerState.healthy = true
        closeCircuit()
        console.log(`[Blockchain] Reconnected successfully on attempt ${attempt}`)
        return
      } catch (err) {
        console.error(
          `[Blockchain] Reconnect attempt ${attempt} failed:`,
          (err as Error).message,
        )
      }
    }

    // All attempts in this cycle exhausted
    listenerState.healthy = false
    recordCircuitFailure()

    console.error(
      `[Blockchain] All ${MAX_RECONNECT_ATTEMPTS} reconnect attempts failed — listener is degraded. Manual intervention required.`,
    )

    // Send admin alert (rate-limited by ALERT_COOLDOWN_MS — see maybeSendUnhealthyAlert)
    await maybeSendUnhealthyAlert(
      `Automatic reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts — RPC ${rpcUrl}`,
    )
  } finally {
    listenerState.reconnecting      = false
    listenerState.reconnectInFlight = false
  }
}

export async function startBlockchainListener() {
  const rpcUrl = process.env.ETH_RPC_URL

  if (!rpcUrl) {
    console.warn('[Blockchain] ETH_RPC_URL not set — listener not started')
    return
  }

  const addressSets = await loadActiveEvmAddressSets()
  const anyActive = addressSets.eth.size > 0 || addressSets.usdt.size > 0 || addressSets.usdc.size > 0
  if (!anyActive) {
    console.warn('[Blockchain] No active ETH/USDT/USDC deposit address configured — listener not started (set one on the Deposit Addresses admin page)')
    return
  }

  // Seed the in-memory price cache from the database before the listener
  // starts so the pending_price retry loop can run on a cold restart without
  // waiting for the next CoinGecko poll interval.
  await loadEthPriceCacheFromDb()

  const provider = new ethers.JsonRpcProvider(rpcUrl)

  listenerState.active             = true
  listenerState.startedAt          = Date.now()
  listenerState.healthy            = true
  listenerState.reconnecting       = false
  listenerState.reconnectAttempts  = 0
  listenerState.reconnectInFlight  = false
  listenerState.circuitState       = 'closed'
  listenerState.consecutiveFailures = 0
  listenerState.circuitOpenedAt    = null

  console.log(`[Blockchain] Watching for fixed-address ETH/USDT/USDC deposits (min ${MIN_CONFIRMATIONS} confirmations)`)

  await attachDepositWatchers(provider)

  // Trigger reconnect on provider errors
  provider.on('error', (err: Error) => {
    console.error('[Blockchain] Provider error:', err.message)
    listenerState.healthy = false
    recordCircuitFailure()
    maybeSendUnhealthyAlert(`Provider error: ${err.message}`).catch(console.error)
    reconnectWithBackoff(rpcUrl).catch(console.error)
  })

  // Retry any transactions that were deferred due to missing ETH price
  startPendingPriceRetryLoop()
  startPendingPriceRetryWatchdog()

  // Periodic health checks
  startListenerHealthCheck(rpcUrl)
}

// ── Listener health check ──────────────────────────────────────────────────

async function runListenerHealthCheck(rpcUrl: string): Promise<void> {
  const now = Date.now()
  listenerState.lastCheckedAt = now

  // Use a fresh provider for the health probe so a broken cached provider
  // does not give a false-positive result.
  const probeProvider = new ethers.JsonRpcProvider(rpcUrl)

  // Verify provider connectivity by fetching the latest block number.
  // There is no single "contract" to probe anymore — reachability of the
  // RPC endpoint is the only meaningful health signal for a fixed-address
  // deposit watcher (event silence alone is not a failure criterion).
  let providerOk = false
  try {
    await probeProvider.getBlockNumber()
    providerOk = true
  } catch (err) {
    console.error('[Blockchain] Health check: provider unreachable —', (err as Error).message)
  }

  if (providerOk) {
    listenerState.healthy = true
    closeCircuit()
    console.log('[Blockchain] Health check: OK (provider reachable)')
    if (activeProvider) {
      maybeRebindDepositWatchers(activeProvider).catch(err =>
        console.error('[Blockchain] Failed to rebind deposit watchers:', err),
      )
    }
    return
  }

  const reason = 'RPC provider unreachable'
  console.warn(`[Blockchain] Health check FAILED: ${reason}`)

  // Mark unhealthy, alert admins (rate-limited), and trigger automatic
  // reconnect — all non-blocking.
  listenerState.healthy = false
  recordCircuitFailure()
  maybeSendUnhealthyAlert(reason).catch(console.error)
  reconnectWithBackoff(rpcUrl).catch(console.error)
}

function startListenerHealthCheck(rpcUrl: string): void {
  // Run once shortly after startup, then on the regular interval
  setTimeout(
    () => runListenerHealthCheck(rpcUrl),
    30_000,  // 30 s after startup — let things settle first
  )
  setInterval(
    () => runListenerHealthCheck(rpcUrl),
    LISTENER_HEALTH_CHECK_INTERVAL_MS,
  )
  console.log('[Blockchain] Health check scheduled (interval: 5 min, silence threshold: ' +
    `${Math.round(LISTENER_SILENCE_THRESHOLD_MS / 60000)} min)`)
}

// ── Pending-price retry loop ───────────────────────────────────────────────
// Runs every 5 minutes.  For each transaction stuck in `pending_price`, it
// re-attempts to fetch the ETH price and, if successful, credits the user.
const PENDING_PRICE_RETRY_INTERVAL_MS = 5 * 60 * 1000

export async function retryPendingPriceTransactions(): Promise<void> {
  // Record that the loop ran — the watchdog uses this to detect a stalled
  // loop (e.g. an unhandled exception that silently killed the interval).
  listenerState.lastRetryRunAt = Date.now()

  // Fetch price first — no point querying the DB if we still can't price
  const price = await fetchEthUsdPrice()
  if (price === null) {
    console.warn('[Blockchain] Retry loop: ETH price still unavailable — will try again later')
    return
  }

  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, user_id, metadata')
    .eq('status', 'pending_price')

  if (error) {
    console.error('[Blockchain] Retry loop: failed to query pending_price transactions:', error.message)
    return
  }

  if (!rows || rows.length === 0) return

  console.log(`[Blockchain] Retry loop: re-pricing ${rows.length} pending_price transaction(s) at ${price}`)

  for (const row of rows) {
    try {
      let meta: { rawAmount?: string; txHash?: string; eventKey?: string } = {}
      try {
        meta = JSON.parse(row.metadata ?? '{}')
      } catch {
        console.warn(`[Blockchain] Retry loop: invalid metadata for tx ${row.id} — skipping`)
        continue
      }

      const { rawAmount, txHash, eventKey } = meta
      if (!rawAmount || !txHash || !eventKey) {
        console.warn(`[Blockchain] Retry loop: incomplete metadata for tx ${row.id} — skipping`)
        continue
      }

      const ethAmount = Number(BigInt(rawAmount)) / 1e18
      const usdValue  = ethAmount * price

      if (usdValue <= 0) {
        console.warn(`[Blockchain] Retry loop: computed $0 for tx ${row.id} — skipping`)
        continue
      }

      const credited = await atomicCredit(
        row.id,
        row.user_id,
        usdValue,
        txHash,
        eventKey,
        ['pending_price'],  // only transition from pending_price
      )

      if (credited) {
        console.log(`[Blockchain] Retry loop: credited ${usdValue.toFixed(2)} for tx ${row.id}`)
      }
    } catch (err) {
      console.error(`[Blockchain] Retry loop: error processing tx ${row.id}:`, err)
    }
  }
}

// Tracks the currently active retry-loop interval so the watchdog can clear
// it before rescheduling — otherwise a restart after a stall would leave two
// intervals running concurrently.
let retryLoopIntervalHandle: NodeJS.Timeout | null = null

function startPendingPriceRetryLoop(): void {
  if (retryLoopIntervalHandle) {
    clearInterval(retryLoopIntervalHandle)
  }
  retryLoopIntervalHandle = setInterval(retryPendingPriceTransactions, PENDING_PRICE_RETRY_INTERVAL_MS)
  console.log('[Blockchain] Pending-price retry loop started (interval: 5 min)')
}

// ── Pending-price retry loop watchdog ──────────────────────────────────────
// Guards against the retry loop silently dying (e.g. an unhandled exception
// escaping retryPendingPriceTransactions, or the interval otherwise being
// cleared/lost). Runs every 15 min and, if the loop hasn't run recently,
// force-restarts it and logs a warning so stuck `pending_price` transactions
// don't require a manual server restart to recover.
const RETRY_WATCHDOG_INTERVAL_MS = 15 * 60 * 1000  // 15 minutes
// Allow some slack over the normal 5-min cadence before declaring a stall.
const RETRY_STALL_THRESHOLD_MS   = PENDING_PRICE_RETRY_INTERVAL_MS * 3  // 15 minutes

function startPendingPriceRetryWatchdog(): void {
  setInterval(() => {
    const now = Date.now()
    // lastRetryRunAt is null until the loop's first tick fires (5 min after
    // startup), so treat "never run yet, but startup was longer ago than the
    // stall threshold" the same as a stall.
    const reference = listenerState.lastRetryRunAt ?? listenerState.startedAt
    const sinceLastRun = reference ? now - reference : null

    if (sinceLastRun !== null && sinceLastRun < RETRY_STALL_THRESHOLD_MS) {
      return  // loop is healthy — nothing to do
    }

    const sinceLastRunSec = sinceLastRun !== null ? Math.round(sinceLastRun / 1000) : null
    console.warn(
      `[Blockchain] Pending-price retry loop watchdog: no run detected in ` +
      `${sinceLastRunSec ?? 'an unknown amount of'}s (threshold ${Math.round(RETRY_STALL_THRESHOLD_MS / 1000)}s) — restarting loop`,
    )

    startPendingPriceRetryLoop()
    // Kick off an immediate run so stuck transactions don't wait a further
    // 5 minutes for the newly-scheduled interval to fire.
    retryPendingPriceTransactions().catch(err => {
      console.error('[Blockchain] Watchdog-triggered retry run failed:', err)
    })
  }, RETRY_WATCHDOG_INTERVAL_MS)

  console.log(
    `[Blockchain] Pending-price retry loop watchdog scheduled (interval: ${Math.round(RETRY_WATCHDOG_INTERVAL_MS / 60000)} min, ` +
    `stall threshold: ${Math.round(RETRY_STALL_THRESHOLD_MS / 60000)} min)`,
  )
}
