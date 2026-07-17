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
import { type EvmCoin } from './depositAddresses';
export declare const ERC20_TRANSFER_ABI: string[];
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
export interface EthPriceStatus {
    price: number | null;
    fetchedAt: string | null;
    ageSec: number | null;
    stale: boolean;
    staleThresholdSec: number;
}
/**
 * Returns a snapshot of the ETH/USD price cache for the admin dashboard —
 * the price, when it was last fetched live from CoinGecko, and whether it
 * has gone stale. Does not trigger a new fetch.
 */
export declare function getEthPriceStatus(): EthPriceStatus;
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
export declare function verifyEvmTransaction(coin: EvmCoin, txHash: string, expectedRaw: bigint): Promise<{
    usdValue: number;
    rawAmount: string;
} | {
    error: string;
}>;
export type CircuitState = 'closed' | 'open' | 'half_open';
export interface ListenerStatus {
    active: boolean;
    lastEventAt: string | null;
    lastCheckedAt: string | null;
    healthy: boolean;
    silenceSec: number | null;
    silenceWarning: boolean;
    reconnecting: boolean;
    reconnectAttempts: number;
    circuitState: CircuitState;
    consecutiveFailures: number;
    circuitCooldownRemainingSec: number | null;
    message: string;
    lastRetryRunAt: string | null;
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
