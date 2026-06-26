import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

export interface CoinData {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  market_cap: number
  market_cap_rank: number
  price_change_percentage_24h: number
  total_volume: number
  sparkline_in_7d?: { price: number[] }
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const REFRESH_INTERVAL = 30_000 // 30s

export function useCryptoPrices(limit = 25) {
  const [coins, setCoins]     = useState<CoinData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchPrices = useCallback(async () => {
    try {
      const { data } = await axios.get<CoinData[]>(
        `${COINGECKO_BASE}/coins/markets`,
        {
          params: {
            vs_currency: 'usd',
            order: 'market_cap_desc',
            per_page: limit,
            page: 1,
            sparkline: true,
            price_change_percentage: '24h',
          },
        }
      )
      setCoins(data)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      // Fallback to CoinCap if CoinGecko rate-limits
      try {
        const { data } = await axios.get('https://api.coincap.io/v2/assets', {
          params: { limit },
        })
        const mapped: CoinData[] = data.data.map((a: any) => ({
          id: a.id,
          symbol: a.symbol.toLowerCase(),
          name: a.name,
          image: `https://assets.coincap.io/assets/icons/${a.symbol.toLowerCase()}@2x.png`,
          current_price: parseFloat(a.priceUsd),
          market_cap: parseFloat(a.marketCapUsd),
          market_cap_rank: parseInt(a.rank),
          price_change_percentage_24h: parseFloat(a.changePercent24Hr),
          total_volume: parseFloat(a.volumeUsd24Hr),
        }))
        setCoins(mapped)
        setLastUpdated(new Date())
      } catch {
        setError('Unable to fetch prices. Please try again shortly.')
      }
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchPrices()
    const id = setInterval(fetchPrices, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchPrices])

  return { coins, loading, error, lastUpdated, refetch: fetchPrices }
}

// Format helpers
export const fmt = {
  usd: (n: number, decimals = 2) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n),
  compact: (n: number) =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n),
  pct: (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`,
}
