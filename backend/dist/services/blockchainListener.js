"use strict";
/**
 * Ethereum blockchain listener for AstroPaymentReceiver contract events.
 * Watches for PaymentReceived events, matches them to pending transactions,
 * and atomically credits user balances after sufficient confirmations.
 *
 * Safety properties:
 *  - Idempotent: uses conditional status update (pending → confirmed) so
 *    replayed events or multi-instance races never double-credit.
 *  - Finality-guarded: waits MIN_CONFIRMATIONS blocks before crediting to
 *    protect against chain reorgs.
 *  - Deduplication: processed (txHash + logIndex) pairs are persisted so
 *    restarts cannot replay an already-handled event.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_MAP = exports.CONTRACT_ABI = void 0;
exports.loadEthPriceCacheFromDb = loadEthPriceCacheFromDb;
exports.fetchEthUsdPrice = fetchEthUsdPrice;
exports.atomicCredit = atomicCredit;
exports.getUsdValue = getUsdValue;
exports.getListenerStatus = getListenerStatus;
exports.startBlockchainListener = startBlockchainListener;
exports.retryPendingPriceTransactions = retryPendingPriceTransactions;
const ethers_1 = require("ethers");
const supabase_1 = require("../lib/supabase");
const email_1 = require("./email");
// Minimal ABI — only the event we need
exports.CONTRACT_ABI = [
    'event PaymentReceived(bytes32 indexed paymentId, address indexed sender, address token, uint256 amount)',
];
// Known ERC-20 token addresses on Ethereum mainnet
exports.TOKEN_MAP = {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
};
// How many block confirmations to wait before crediting.
// 12 is a safe default for Ethereum mainnet; override via env for testnets.
const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS ?? '12', 10);
// ── ETH price cache ────────────────────────────────────────────────────────
// Holds the last successfully fetched ETH/USD price and when it was fetched.
// Used as a fallback when CoinGecko is unreachable so in-flight deposits are
// never silently dropped due to a transient API outage.
//
// The cache is also persisted to the `system_settings` table under the key
// `eth_price_cache` so it survives server restarts.  On startup the in-memory
// cache is seeded from the DB, meaning the `pending_price` retry loop can run
// immediately after a cold restart without waiting for the next CoinGecko poll.
const ETH_PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ETH_PRICE_CACHE_DB_KEY = 'eth_price_cache';
let ethPriceCache = null;
/**
 * Persist the current in-memory ETH price cache to the `system_settings`
 * table so it survives server restarts.  Fire-and-forget — failures are
 * logged but never thrown, so the caller's happy path is unaffected.
 */
async function persistEthPriceCache(cache) {
    try {
        const { error } = await supabase_1.supabase
            .from('system_settings')
            .upsert({ key: ETH_PRICE_CACHE_DB_KEY, value: JSON.stringify(cache), updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) {
            console.warn('[Blockchain] Failed to persist ETH price cache to DB:', error.message);
        }
    }
    catch (err) {
        console.warn('[Blockchain] Failed to persist ETH price cache to DB:', err.message);
    }
}
/**
 * Seed the in-memory ETH price cache from the database on startup.
 * This means a cold restart does not lose the last known price, so
 * the `pending_price` retry loop can re-price deposits immediately.
 */
async function loadEthPriceCacheFromDb() {
    try {
        const { data, error } = await supabase_1.supabase
            .from('system_settings')
            .select('value')
            .eq('key', ETH_PRICE_CACHE_DB_KEY)
            .maybeSingle();
        if (error) {
            console.warn('[Blockchain] Could not load ETH price cache from DB:', error.message);
            return;
        }
        if (!data?.value) {
            console.log('[Blockchain] No persisted ETH price cache found — will fetch fresh on first deposit');
            return;
        }
        const parsed = JSON.parse(data.value);
        if (parsed.price > 0 && parsed.fetchedAt) {
            ethPriceCache = parsed;
            const ageSec = Math.round((Date.now() - parsed.fetchedAt) / 1000);
            console.log(`[Blockchain] Seeded ETH price cache from DB: ${parsed.price} (${ageSec}s old)`);
        }
    }
    catch (err) {
        console.warn('[Blockchain] Failed to parse persisted ETH price cache:', err.message);
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
async function fetchEthUsdPrice() {
    // Return cache if still fresh
    if (ethPriceCache && Date.now() - ethPriceCache.fetchedAt < ETH_PRICE_CACHE_TTL_MS) {
        return ethPriceCache.price;
    }
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: 'ethereum', vs_currencies: 'usd' },
            timeout: 8000,
        });
        const price = data['ethereum']?.usd ?? 0;
        if (price > 0) {
            const newCache = { price, fetchedAt: Date.now() };
            ethPriceCache = newCache;
            // Persist to DB asynchronously — don't await to avoid slowing the caller
            persistEthPriceCache(newCache).catch(() => { });
            return price;
        }
        // CoinGecko returned 0 — treat as failure, fall through to stale cache
        console.warn('[Blockchain] CoinGecko returned 0 for ETH price — using stale cache if available');
    }
    catch (err) {
        console.error('[Blockchain] Failed to fetch ETH price from CoinGecko:', err.message);
    }
    // On failure, use stale cache (any age) rather than dropping the deposit
    if (ethPriceCache) {
        const staleAgeSec = Math.round((Date.now() - ethPriceCache.fetchedAt) / 1000);
        console.warn(`[Blockchain] Using stale ETH price ${ethPriceCache.price} (${staleAgeSec}s old) as fallback`);
        return ethPriceCache.price;
    }
    // No cache at all — caller must handle the missing price
    return null;
}
async function atomicCredit(txId, userId, amountUsd, txHash, eventKey, // `${txHash}:${logIndex}` — uniqueness guard
fromStatuses = ['pending'], // statuses eligible for transition
auditOverride) {
    // 1. Transition status → confirmed.
    //    The .in('status', fromStatuses) guard makes this a no-op on replay.
    const { data: updated, error: txErr } = await supabase_1.supabase
        .from('transactions')
        .update({ status: 'confirmed', amount_usd: amountUsd, tx_hash: txHash })
        .eq('id', txId)
        .in('status', fromStatuses) // ← conditional: only update once
        .select('id');
    if (txErr) {
        console.error('[Blockchain] Failed to confirm transaction:', txErr.message);
        throw txErr;
    }
    if (!updated || updated.length === 0) {
        // Already confirmed by a previous run — skip balance update
        console.log(`[Blockchain] Transaction ${txId} already confirmed — skipping (event: ${eventKey})`);
        return false;
    }
    // 2. Increment balance atomically using Postgres addition.
    //    Using .rpc() avoids a read-modify-write race between concurrent instances.
    const { error: balErr } = await supabase_1.supabase.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: amountUsd,
    });
    if (balErr) {
        // Roll back the status update so the event can be retried
        await supabase_1.supabase
            .from('transactions')
            .update({ status: 'pending' })
            .eq('id', txId);
        console.error('[Blockchain] Balance increment failed — rolled back tx status:', balErr.message);
        throw balErr;
    }
    // 3. Confirmation email + audit log (best-effort — don't roll back on failure)
    try {
        const { data: user } = await supabase_1.supabase
            .from('users')
            .select('email, full_name')
            .eq('id', userId)
            .single();
        if (user) {
            await email_1.emailService.sendDepositConfirmed(user.email, user.full_name, amountUsd);
        }
    }
    catch (e) {
        console.warn('[Blockchain] Confirmation email failed (non-fatal):', e);
    }
    try {
        if (auditOverride) {
            await supabase_1.supabase.from('audit_logs').insert({
                user_id: userId,
                action: auditOverride.action,
                metadata: JSON.stringify({
                    amountUsd,
                    txId,
                    txHash,
                    eventKey,
                    source: auditOverride.source,
                    mode: auditOverride.mode,
                    adminId: auditOverride.adminId,
                }),
                ip_address: auditOverride.ip ?? 'admin',
            });
        }
        else {
            await supabase_1.supabase.from('audit_logs').insert({
                user_id: userId,
                action: 'deposit_confirmed',
                metadata: JSON.stringify({ amountUsd, txId, txHash, eventKey }),
                ip_address: 'blockchain',
            });
        }
    }
    catch (e) {
        console.warn('[Blockchain] Audit log failed (non-fatal):', e);
    }
    console.log(`[Blockchain] Credited $${amountUsd} to user ${userId} (tx: ${txId}, event: ${eventKey})`);
    return true;
}
/**
 * Convert a raw on-chain amount to its USD value.
 *
 * Returns null (instead of 0) when the ETH price cannot be determined —
 * the caller is responsible for deferring the credit rather than dropping it.
 */
async function getUsdValue(token, rawAmount, decimals) {
    const isStablecoin = token !== 'ETH';
    if (isStablecoin) {
        return Number(rawAmount) / 10 ** decimals;
    }
    const price = await fetchEthUsdPrice();
    if (price === null) {
        return null;
    }
    const amount = Number(rawAmount) / 1e18;
    return amount * price;
}
const listenerState = {
    active: false,
    lastEventAt: null, // Date.now() of last event
    startedAt: null,
    lastCheckedAt: null,
    healthy: true,
    lastAlertAt: null, // Date.now() of last admin alert sent
    reconnecting: false,
    reconnectAttempts: 0,
    lastReconnectAt: null,
};
// Tracks the currently active contract instance so listeners can be removed
// before a new provider/contract pair is attached on reconnect.
let activeContract = null;
// How long with no events before we consider the listener stalled.
// Mainnet blocks arrive every ~12 s, so 10 min with zero events is suspicious.
// Set LISTENER_SILENCE_THRESHOLD_MS in env to override (useful on testnets).
const LISTENER_SILENCE_THRESHOLD_MS = parseInt(process.env.LISTENER_SILENCE_THRESHOLD_MS ?? String(10 * 60 * 1000), 10);
// How often to run the health probe.
const LISTENER_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Minimum gap between admin alert emails (avoid inbox flooding).
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
/**
 * Returns a snapshot of the blockchain listener's health for external monitors.
 *
 * `healthy` is false only when the RPC provider or contract is unreachable —
 * genuine connection failures that prevent events from being processed.
 * Event silence alone (no PaymentReceived in a while) is normal during low
 * traffic and is exposed only as `silenceWarning` for informational purposes.
 */
function getListenerStatus() {
    if (!listenerState.active) {
        return {
            active: false,
            lastEventAt: null,
            lastCheckedAt: null,
            healthy: true, // "not configured" is not an error state
            silenceSec: null,
            silenceWarning: false,
            reconnecting: false,
            reconnectAttempts: 0,
            message: 'Listener not configured (ETH_RPC_URL or CONTRACT_ADDRESS missing)',
        };
    }
    const now = Date.now();
    const silenceSec = listenerState.lastEventAt
        ? Math.round((now - listenerState.lastEventAt) / 1000)
        : listenerState.startedAt
            ? Math.round((now - listenerState.startedAt) / 1000)
            : null;
    // Silence warning: threshold exceeded — but only after the startup grace period
    const pastGrace = listenerState.startedAt !== null &&
        now - listenerState.startedAt > LISTENER_SILENCE_THRESHOLD_MS;
    const silenceWarning = pastGrace &&
        silenceSec !== null &&
        silenceSec * 1000 > LISTENER_SILENCE_THRESHOLD_MS;
    let message;
    if (listenerState.reconnecting) {
        message = `Reconnecting to provider (attempt ${listenerState.reconnectAttempts} with exponential backoff)…`;
    }
    else if (!listenerState.healthy) {
        message = 'Provider unreachable or contract not found — check RPC connection';
    }
    else if (silenceWarning) {
        const silenceMin = Math.round(silenceSec / 60);
        message = `Provider healthy — no events for ${silenceMin} min (normal if no deposits)`;
    }
    else {
        message = 'Listener healthy';
    }
    return {
        active: true,
        lastEventAt: listenerState.lastEventAt
            ? new Date(listenerState.lastEventAt).toISOString()
            : null,
        lastCheckedAt: listenerState.lastCheckedAt
            ? new Date(listenerState.lastCheckedAt).toISOString()
            : null,
        healthy: listenerState.healthy,
        silenceSec,
        silenceWarning,
        reconnecting: listenerState.reconnecting,
        reconnectAttempts: listenerState.reconnectAttempts,
        message,
    };
}
// ── Reconnect configuration ────────────────────────────────────────────────
// Exponential backoff delays for reconnect attempts (ms).
// After MAX_RECONNECT_ATTEMPTS the listener gives up and sends an alert.
const RECONNECT_BACKOFF_MS = [5000, 10000, 30000, 60000, 60000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;
/**
 * Attach the PaymentReceived event handler to a contract instance.
 * Extracted so it can be called on initial start and on every reconnect.
 *
 * Removes all listeners from the previous contract instance first so old
 * handlers do not accumulate and process events twice after a reconnect.
 */
function attachPaymentReceivedHandler(provider, contract) {
    // Detach handlers from the previously active contract (if any)
    if (activeContract && activeContract !== contract) {
        try {
            activeContract.removeAllListeners();
        }
        catch {
            // Ignore — old provider may already be dead
        }
    }
    activeContract = contract;
    contract.on('PaymentReceived', async (paymentId, _sender, token, rawAmount, event) => {
        // A successful event means the provider is healthy
        listenerState.lastEventAt = Date.now();
        listenerState.healthy = true;
        listenerState.reconnecting = false;
        listenerState.reconnectAttempts = 0;
        const txHash = event.transactionHash;
        const logIndex = event.index;
        const eventKey = `${txHash}:${logIndex}`;
        console.log(`[Blockchain] PaymentReceived paymentId=${paymentId} tx=${txHash} — waiting ${MIN_CONFIRMATIONS} confirmations…`);
        try {
            // ── Wait for finality ──────────────────────────────────────────────
            const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS);
            if (!receipt || receipt.status !== 1) {
                const reason = receipt ? 'Transaction reverted on chain' : 'Receipt not found — transaction may have been dropped';
                console.warn(`[Blockchain] Transaction ${txHash} ${receipt ? 'reverted' : 'not found'} — skipping`);
                await supabase_1.supabase
                    .from('transactions')
                    .update({ failure_reason: reason })
                    .eq('tx_hash', paymentId)
                    .in('status', ['pending']);
                return;
            }
            // ── Look up pending transaction ────────────────────────────────────
            const { data: txRecord, error: lookupErr } = await supabase_1.supabase
                .from('transactions')
                .select('id, user_id, amount_usd')
                .eq('tx_hash', paymentId)
                .in('status', ['pending', 'confirmed']) // include confirmed for idempotency check
                .maybeSingle();
            if (lookupErr) {
                console.error('[Blockchain] DB lookup error:', lookupErr.message);
                return;
            }
            if (!txRecord) {
                console.warn(`[Blockchain] No transaction found for paymentId ${paymentId}`);
                return;
            }
            // ── Determine USD value ────────────────────────────────────────────
            const isETH = token === ethers_1.ethers.ZeroAddress;
            let usdValue;
            if (isETH) {
                usdValue = await getUsdValue('ETH', rawAmount, 18);
            }
            else {
                const tokenInfo = exports.TOKEN_MAP[token.toLowerCase()];
                if (!tokenInfo) {
                    console.warn(`[Blockchain] Unknown token ${token} — cannot determine USD value`);
                    await supabase_1.supabase
                        .from('transactions')
                        .update({ failure_reason: `Unknown token ${token} — not in supported token list` })
                        .eq('id', txRecord.id)
                        .in('status', ['pending']);
                    return;
                }
                usdValue = await getUsdValue(tokenInfo.symbol, rawAmount, tokenInfo.decimals);
            }
            if (usdValue === null) {
                // ETH price unavailable and no cache — defer rather than drop.
                console.warn(`[Blockchain] ETH price unavailable for paymentId ${paymentId} — marking pending_price for retry`);
                const { error: deferErr } = await supabase_1.supabase
                    .from('transactions')
                    .update({
                    status: 'pending_price',
                    failure_reason: 'ETH price unavailable — no cache at confirmation time (retry loop will re-price)',
                    metadata: JSON.stringify({
                        rawAmount: rawAmount.toString(),
                        token: isETH ? 'ETH' : token,
                        txHash,
                        eventKey,
                    }),
                })
                    .eq('id', txRecord.id)
                    .in('status', ['pending']);
                if (deferErr) {
                    console.error(`[Blockchain] CRITICAL: could not defer tx ${txRecord.id} to pending_price — ` +
                        `deposit may require manual admin credit. Error: ${deferErr.message}`);
                }
                else {
                    console.log(`[Blockchain] Tx ${txRecord.id} deferred to pending_price — retry loop will credit it when price recovers`);
                }
                return;
            }
            if (usdValue <= 0) {
                console.warn(`[Blockchain] USD value is 0 for paymentId ${paymentId} — skipping credit`);
                await supabase_1.supabase
                    .from('transactions')
                    .update({ failure_reason: 'ETH price returned $0 at confirmation time — use manual USD override' })
                    .eq('id', txRecord.id)
                    .in('status', ['pending']);
                return;
            }
            // ── Atomic, idempotent credit ──────────────────────────────────────
            await atomicCredit(txRecord.id, txRecord.user_id, usdValue, txHash, eventKey);
        }
        catch (err) {
            console.error('[Blockchain] Error processing PaymentReceived:', err);
        }
    });
}
/**
 * Attempt to rebuild the provider and re-attach the contract event listener
 * using exponential backoff.  Called when a provider error is detected or the
 * periodic health check confirms the connection is broken.
 *
 * Uses `listenerState.reconnecting` as a mutex so concurrent triggers (e.g. a
 * provider error fired while a health check is also running) only start one
 * reconnect sequence.
 */
async function reconnectWithBackoff(rpcUrl, contractAddr) {
    if (listenerState.reconnecting) {
        // A reconnect sequence is already running — don't start another
        return;
    }
    // Reset the per-outage budget so exhausted state from a previous cycle
    // never blocks future reconnection attempts.
    listenerState.reconnecting = true;
    listenerState.reconnectAttempts = 0;
    while (listenerState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const attempt = listenerState.reconnectAttempts + 1;
        const delayMs = RECONNECT_BACKOFF_MS[listenerState.reconnectAttempts];
        listenerState.reconnectAttempts = attempt;
        listenerState.lastReconnectAt = Date.now();
        console.log(`[Blockchain] Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs / 1000}s…`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        try {
            const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
            // Quick connectivity check before attaching a full listener
            await provider.getBlockNumber();
            const contract = new ethers_1.ethers.Contract(contractAddr, exports.CONTRACT_ABI, provider);
            attachPaymentReceivedHandler(provider, contract);
            // Re-arm the provider error handler for this new provider instance
            provider.on('error', (err) => {
                console.error('[Blockchain] Provider error (post-reconnect):', err.message);
                listenerState.healthy = false;
                reconnectWithBackoff(rpcUrl, contractAddr).catch(console.error);
            });
            listenerState.healthy = true;
            listenerState.reconnecting = false;
            listenerState.reconnectAttempts = 0; // reset per-outage budget for the next drop
            console.log(`[Blockchain] Reconnected successfully on attempt ${attempt}`);
            return;
        }
        catch (err) {
            console.error(`[Blockchain] Reconnect attempt ${attempt} failed:`, err.message);
        }
    }
    // All attempts exhausted
    listenerState.reconnecting = false;
    listenerState.healthy = false;
    console.error(`[Blockchain] All ${MAX_RECONNECT_ATTEMPTS} reconnect attempts failed — listener is degraded. Manual intervention required.`);
    // Send admin alert (rate-limited by ALERT_COOLDOWN_MS)
    const now = Date.now();
    const cooldownOk = listenerState.lastAlertAt === null ||
        now - listenerState.lastAlertAt > ALERT_COOLDOWN_MS;
    if (cooldownOk) {
        listenerState.lastAlertAt = now;
        try {
            await email_1.emailService.sendListenerAlert(`Automatic reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`, `Contract: ${contractAddr}\nLast attempt: ${new Date(now).toISOString()}\nManual server restart may be required.`);
            console.warn('[Blockchain] Admin alert email sent (reconnect exhausted)');
        }
        catch (alertErr) {
            console.error('[Blockchain] Failed to send admin alert email:', alertErr.message);
        }
    }
}
async function startBlockchainListener() {
    const rpcUrl = process.env.ETH_RPC_URL;
    const contractAddr = process.env.CONTRACT_ADDRESS;
    if (!rpcUrl) {
        console.warn('[Blockchain] ETH_RPC_URL not set — listener not started');
        return;
    }
    if (!contractAddr) {
        console.warn('[Blockchain] CONTRACT_ADDRESS not set — listener not started (deploy the contract first)');
        return;
    }
    // Seed the in-memory price cache from the database before the listener
    // starts so the pending_price retry loop can run on a cold restart without
    // waiting for the next CoinGecko poll interval.
    await loadEthPriceCacheFromDb();
    const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers_1.ethers.Contract(contractAddr, exports.CONTRACT_ABI, provider);
    listenerState.active = true;
    listenerState.startedAt = Date.now();
    listenerState.healthy = true;
    listenerState.reconnecting = false;
    listenerState.reconnectAttempts = 0;
    activeContract = contract;
    console.log(`[Blockchain] Listening for PaymentReceived on ${contractAddr} (min ${MIN_CONFIRMATIONS} confirmations)`);
    attachPaymentReceivedHandler(provider, contract);
    // Trigger reconnect on provider errors
    provider.on('error', (err) => {
        console.error('[Blockchain] Provider error:', err.message);
        listenerState.healthy = false;
        reconnectWithBackoff(rpcUrl, contractAddr).catch(console.error);
    });
    // Retry any transactions that were deferred due to missing ETH price
    startPendingPriceRetryLoop();
    // Periodic health checks
    startListenerHealthCheck(rpcUrl, contractAddr);
}
// ── Listener health check ──────────────────────────────────────────────────
async function runListenerHealthCheck(rpcUrl, contractAddr) {
    const now = Date.now();
    listenerState.lastCheckedAt = now;
    // Use a fresh provider for the health probe so a broken cached provider
    // does not give a false-positive result.
    const probeProvider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
    // 1. Verify provider connectivity by fetching the latest block number.
    let providerOk = false;
    try {
        await probeProvider.getBlockNumber();
        providerOk = true;
    }
    catch (err) {
        console.error('[Blockchain] Health check: provider unreachable —', err.message);
    }
    // 2. Check contract reachability (light call — no gas, no writes).
    let contractOk = false;
    if (providerOk) {
        try {
            const code = await probeProvider.getCode(contractAddr);
            contractOk = code !== '0x' && code !== ''; // non-empty = contract deployed
        }
        catch (err) {
            console.error('[Blockchain] Health check: contract unreachable —', err.message);
        }
    }
    // 3. Healthy = provider reachable AND contract deployed.
    //    Event silence is NOT a failure criterion — no deposits during a quiet period
    //    is normal and does not indicate the listener is broken.
    const isHealthy = providerOk && contractOk;
    if (isHealthy) {
        listenerState.healthy = true;
        console.log('[Blockchain] Health check: OK (provider reachable, contract found)');
        return;
    }
    // Build a clear reason string for logs + alert email
    const reasons = [];
    if (!providerOk)
        reasons.push('RPC provider unreachable');
    if (!contractOk)
        reasons.push('contract not found at address (code = 0x)');
    const reason = reasons.join('; ');
    console.warn(`[Blockchain] Health check FAILED: ${reason}`);
    // 4. Mark unhealthy and trigger automatic reconnect (non-blocking).
    listenerState.healthy = false;
    reconnectWithBackoff(rpcUrl, contractAddr).catch(console.error);
}
function startListenerHealthCheck(rpcUrl, contractAddr) {
    // Run once shortly after startup, then on the regular interval
    setTimeout(() => runListenerHealthCheck(rpcUrl, contractAddr), 30000);
    setInterval(() => runListenerHealthCheck(rpcUrl, contractAddr), LISTENER_HEALTH_CHECK_INTERVAL_MS);
    console.log('[Blockchain] Health check scheduled (interval: 5 min, silence threshold: ' +
        `${Math.round(LISTENER_SILENCE_THRESHOLD_MS / 60000)} min)`);
}
// ── Pending-price retry loop ───────────────────────────────────────────────
// Runs every 5 minutes.  For each transaction stuck in `pending_price`, it
// re-attempts to fetch the ETH price and, if successful, credits the user.
const PENDING_PRICE_RETRY_INTERVAL_MS = 5 * 60 * 1000;
async function retryPendingPriceTransactions() {
    // Fetch price first — no point querying the DB if we still can't price
    const price = await fetchEthUsdPrice();
    if (price === null) {
        console.warn('[Blockchain] Retry loop: ETH price still unavailable — will try again later');
        return;
    }
    const { data: rows, error } = await supabase_1.supabase
        .from('transactions')
        .select('id, user_id, metadata')
        .eq('status', 'pending_price');
    if (error) {
        console.error('[Blockchain] Retry loop: failed to query pending_price transactions:', error.message);
        return;
    }
    if (!rows || rows.length === 0)
        return;
    console.log(`[Blockchain] Retry loop: re-pricing ${rows.length} pending_price transaction(s) at ${price}`);
    for (const row of rows) {
        try {
            let meta = {};
            try {
                meta = JSON.parse(row.metadata ?? '{}');
            }
            catch {
                console.warn(`[Blockchain] Retry loop: invalid metadata for tx ${row.id} — skipping`);
                continue;
            }
            const { rawAmount, txHash, eventKey } = meta;
            if (!rawAmount || !txHash || !eventKey) {
                console.warn(`[Blockchain] Retry loop: incomplete metadata for tx ${row.id} — skipping`);
                continue;
            }
            const ethAmount = Number(BigInt(rawAmount)) / 1e18;
            const usdValue = ethAmount * price;
            if (usdValue <= 0) {
                console.warn(`[Blockchain] Retry loop: computed $0 for tx ${row.id} — skipping`);
                continue;
            }
            const credited = await atomicCredit(row.id, row.user_id, usdValue, txHash, eventKey, ['pending_price']);
            if (credited) {
                console.log(`[Blockchain] Retry loop: credited ${usdValue.toFixed(2)} for tx ${row.id}`);
            }
        }
        catch (err) {
            console.error(`[Blockchain] Retry loop: error processing tx ${row.id}:`, err);
        }
    }
}
function startPendingPriceRetryLoop() {
    setInterval(retryPendingPriceTransactions, PENDING_PRICE_RETRY_INTERVAL_MS);
    console.log('[Blockchain] Pending-price retry loop started (interval: 5 min)');
}
