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

import { supabase } from '../lib/supabase'

export type EvmCoin = 'eth' | 'usdt' | 'usdc'

const CHAIN_FOR_COIN: Record<EvmCoin, string> = {
  eth:  'eth',
  usdt: 'erc20',
  usdc: 'erc20',
}

/** Returns the single active deposit address configured for a coin, or null. */
export async function getActiveEvmAddress(coin: EvmCoin): Promise<string | null> {
  const { data, error } = await supabase
    .from('deposit_addresses')
    .select('address')
    .eq('coin', coin)
    .eq('chain', CHAIN_FOR_COIN[coin])
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error(`[DepositAddresses] Failed to load ${coin} address:`, error.message)
    return null
  }
  return data?.address ?? null
}

export interface EvmAddressSets {
  eth:  Set<string>
  usdt: Set<string>
  usdc: Set<string>
}

/**
 * Loads all currently-active ETH/USDT/USDC deposit addresses, bucketed by
 * coin, lower-cased for case-insensitive matching against on-chain data.
 * Called on every block/Transfer event so address changes made by an admin
 * (via direct Supabase writes on the admin page) take effect without a
 * backend restart.
 */
export async function loadActiveEvmAddressSets(): Promise<EvmAddressSets> {
  const sets: EvmAddressSets = { eth: new Set(), usdt: new Set(), usdc: new Set() }

  const { data, error } = await supabase
    .from('deposit_addresses')
    .select('coin, address')
    .in('coin', ['eth', 'usdt', 'usdc'])
    .eq('is_active', true)

  if (error) {
    console.error('[DepositAddresses] Failed to load active EVM addresses:', error.message)
    return sets
  }

  for (const row of data ?? []) {
    const coin = row.coin as EvmCoin
    if (coin in sets) sets[coin].add(String(row.address).toLowerCase())
  }
  return sets
}
