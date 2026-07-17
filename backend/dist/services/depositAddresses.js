"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveEvmAddress = getActiveEvmAddress;
exports.loadActiveEvmAddressSets = loadActiveEvmAddressSets;
const supabase_1 = require("../lib/supabase");
const CHAIN_FOR_COIN = {
    eth: 'eth',
    usdt: 'erc20',
    usdc: 'erc20',
};
/** Returns the single active deposit address configured for a coin, or null. */
async function getActiveEvmAddress(coin) {
    const { data, error } = await supabase_1.supabase
        .from('deposit_addresses')
        .select('address')
        .eq('coin', coin)
        .eq('chain', CHAIN_FOR_COIN[coin])
        .eq('is_active', true)
        .maybeSingle();
    if (error) {
        console.error(`[DepositAddresses] Failed to load ${coin} address:`, error.message);
        return null;
    }
    return data?.address ?? null;
}
/**
 * Loads all currently-active ETH/USDT/USDC deposit addresses, bucketed by
 * coin, lower-cased for case-insensitive matching against on-chain data.
 * Called on every block/Transfer event so address changes made by an admin
 * (via direct Supabase writes on the admin page) take effect without a
 * backend restart.
 */
async function loadActiveEvmAddressSets() {
    const sets = { eth: new Set(), usdt: new Set(), usdc: new Set() };
    const { data, error } = await supabase_1.supabase
        .from('deposit_addresses')
        .select('coin, address')
        .in('coin', ['eth', 'usdt', 'usdc'])
        .eq('is_active', true);
    if (error) {
        console.error('[DepositAddresses] Failed to load active EVM addresses:', error.message);
        return sets;
    }
    for (const row of data ?? []) {
        const coin = row.coin;
        if (coin in sets)
            sets[coin].add(String(row.address).toLowerCase());
    }
    return sets;
}
