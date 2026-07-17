/**
 * Shared lookup helpers for the `deposit_addresses` table — the
 * admin-managed list of wallet addresses shown to investors for crypto
 * deposits (Deposit Addresses admin page).
 *
 * ETH, USDT (ERC-20), and USDC (ERC-20) deposits use a fixed shared address
 * per coin (no per-user derivation, unlike BTC's xpub-based HD wallet).
 * Admins manage these rows directly from the frontend (Supabase client),
 * so the backend always re-reads the table rather than caching indefinitely.
 */
export type EvmCoin = 'eth' | 'usdt' | 'usdc';
/** Returns the single active deposit address configured for a coin, or null. */
export declare function getActiveEvmAddress(coin: EvmCoin): Promise<string | null>;
export interface EvmAddressSets {
    eth: Set<string>;
    usdt: Set<string>;
    usdc: Set<string>;
}
/**
 * Loads all currently-active ETH/USDT/USDC deposit addresses, bucketed by
 * coin, lower-cased for case-insensitive matching against on-chain data.
 * Called on every block/Transfer event so address changes made by an admin
 * (via direct Supabase writes on the admin page) take effect without a
 * backend restart.
 */
export declare function loadActiveEvmAddressSets(): Promise<EvmAddressSets>;
