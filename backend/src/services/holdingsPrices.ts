// Live USD pricing for the multi-asset holdings breakdown (Portfolio page).
// Kept separate from btcMonitor.ts / blockchainListener.ts — those caches
// exist to price *deposits* and must never be perturbed by an unrelated
// dashboard read. This is a small, independently-cached CoinGecko lookup
// that also returns the 24h % change the UI displays next to each asset.

interface PriceEntry {
  usd: number
  usd_24h_change: number
}

let cache: { data: Record<string, PriceEntry>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60_000

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
}

/**
 * Returns USD price + 24h % change for BTC and ETH (USD/USDT are pegged at
 * $1 and handled by the caller). Falls back to the last successful fetch if
 * CoinGecko is unreachable; returns an empty object only if no fetch has
 * ever succeeded.
 */
export async function getLiveAssetPrices(): Promise<Record<string, PriceEntry>> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data
  }

  try {
    const { default: axios } = await import('axios')
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: Object.values(COINGECKO_IDS).join(','),
        vs_currencies: 'usd',
        include_24hr_change: 'true',
      },
      timeout: 10_000,
    })

    const result: Record<string, PriceEntry> = {}
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      const entry = data[id]
      if (entry?.usd > 0) {
        result[symbol] = { usd: entry.usd, usd_24h_change: entry.usd_24h_change ?? 0 }
      }
    }
    if (Object.keys(result).length > 0) {
      cache = { data: result, fetchedAt: now }
      return result
    }
  } catch (err) {
    console.warn('[Holdings] CoinGecko price fetch failed:', (err as Error).message)
  }

  // Fall back to the last good snapshot (any age) rather than showing $0.
  return cache?.data ?? {}
}
