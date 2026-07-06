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
export declare const CONTRACT_ABI: string[];
export declare const TOKEN_MAP: Record<string, {
    symbol: string;
    decimals: number;
}>;
/**
 * Seed the in-memory ETH price cache from the database on startup.
 * This means a cold restart does not lose the last known price, so
 * the `pending_price` retry loop can re-price deposits immediately.
 */
export declare function loadEthPriceCacheFromDb(): Promise<void>;
/**
 * Fetch the current ETH/USD price from CoinGecko, caching the result for
 * ETH_PRICE_CACHE_TTL_MS.  On failure, returns the cached price (even if
 * stale) so in-flight deposits survive a transient outage.  Returns null
 * only when no price has ever been successfully fetched.
 *
 * Every successful fetch is also written to the `system_settings` table so
 * the price survives a server restart (see `loadEthPriceCacheFromDb`).
 */
export declare function fetchEthUsdPrice(): Promise<number | null>;
/**
 * Atomically transitions a transaction from pending → confirmed and credits
 * the user's balance in a single conditional update.
 *
 * Returns true if credit was applied, false if the transaction was already
 * confirmed (idempotent — safe to call multiple times).
 */
export interface AuditOverride {
    action: string;
    source: string;
    mode: 'manual' | 'chain';
    adminId: string;
    ip?: string;
}
export declare function atomicCredit(txId: string, userId: string, amountUsd: number, txHash: string, eventKey: string, // `${txHash}:${logIndex}` — uniqueness guard
fromStatuses?: string[], // statuses eligible for transition
auditOverride?: AuditOverride): Promise<boolean>;
/**
 * Convert a raw on-chain amount to its USD value.
 *
 * Returns null (instead of 0) when the ETH price cannot be determined —
 * the caller is responsible for deferring the credit rather than dropping it.
 */
export declare function getUsdValue(token: string, rawAmount: bigint, decimals: number): Promise<number | null>;
export interface ListenerStatus {
    active: boolean;
    lastEventAt: string | null;
    lastCheckedAt: string | null;
    healthy: boolean;
    silenceSec: number | null;
    silenceWarning: boolean;
    message: string;
}
/**
 * Returns a snapshot of the blockchain listener's health for external monitors.
 *
 * `healthy` is false only when the RPC provider or contract is unreachable —
 * genuine connection failures that prevent events from being processed.
 * Event silence alone (no PaymentReceived in a while) is normal during low
 * traffic and is exposed only as `silenceWarning` for informational purposes.
 */
export declare function getListenerStatus(): ListenerStatus;
export declare function startBlockchainListener(): Promise<void>;
export declare function retryPendingPriceTransactions(): Promise<void>;
