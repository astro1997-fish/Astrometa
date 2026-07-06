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
 * Atomically transitions a transaction from pending → confirmed and credits
 * the user's balance in a single conditional update.
 *
 * Returns true if credit was applied, false if the transaction was already
 * confirmed (idempotent — safe to call multiple times).
 */
export declare function atomicCredit(txId: string, userId: string, amountUsd: number, txHash: string, eventKey: string, // `${txHash}:${logIndex}` — uniqueness guard
fromStatuses?: string[]): Promise<boolean>;
export declare function getUsdValue(token: string, rawAmount: bigint, decimals: number): Promise<number>;
export declare function startBlockchainListener(): void;
