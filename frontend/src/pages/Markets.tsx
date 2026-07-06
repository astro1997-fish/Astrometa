import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, RefreshCw, TrendingUp, TrendingDown, Star } from 'lucide-react'
import { useCryptoPrices, fmt } from '@/hooks/useCryptoPrices'
import { SkeletonTable } from '@/components/ui/index'
import { clsx } from 'clsx'
import {
  LineChart, Line, ResponsiveContainer, Tooltip
} from 'recharts'

const INVESTABLE = ['bitcoin', 'ethereum', 'usd-coin', 'tether']

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return <div className="w-24 h-8 skeleton" />
  const chartData = data.slice(-20).map(v => ({ v }))
  const isUp = data[data.length - 1] >= data[0]
  return (
    <ResponsiveContainer width={96} height={36}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={isUp ? '#10B981' : '#EF4444'}
          strokeWidth={1.5}
          dot={false}
        />
        <Tooltip
          content={() => null}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function Markets() {
  const { coins, loading, error, lastUpdated, refetch } = useCryptoPrices(30)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'market_cap_rank' | 'price_change_percentage_24h'>('market_cap_rank')

  const filtered = useMemo(() => {
    let list = [...coins]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
    }
    list.sort((a, b) => sortBy === 'market_cap_rank'
      ? a.market_cap_rank - b.market_cap_rank
      : b.price_change_percentage_24h - a.price_change_percentage_24h
    )
    return list
  }, [coins, search, sortBy])

  return (
    <div className="pt-[var(--nav-h)] min-h-screen bg-white dark:bg-[#070D1F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <span className="section-eyebrow">Live Prices</span>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-1 mb-2">Crypto Markets</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Prices refresh every 30 seconds.{' '}
            {lastUpdated && (
              <span className="text-gray-400 dark:text-gray-400">Last updated: {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>

        {/* Investable spotlight */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {coins.filter(c => INVESTABLE.includes(c.id)).map(coin => (
            <motion.div
              key={coin.id}
              whileHover={{ scale: 1.02 }}
              className="card border-brand-400/20 relative overflow-hidden"
            >
              <div className="absolute top-2 right-2">
                <span className="badge-blue text-[10px] px-2 py-0.5 font-semibold">Investable</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full" />
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{coin.symbol.toUpperCase()}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-400">{coin.name}</p>
                </div>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{fmt.usd(coin.current_price)}</p>
              <p className={clsx(
                'text-xs font-semibold mt-0.5 flex items-center gap-0.5',
                coin.price_change_percentage_24h >= 0 ? 'text-emerald-500' : 'text-red-500'
              )}>
                {coin.price_change_percentage_24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {fmt.pct(coin.price_change_percentage_24h)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search coins..."
              className="input pl-9"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('market_cap_rank')}
              className={clsx('btn-ghost text-xs', sortBy === 'market_cap_rank' && 'bg-brand-50 dark:bg-brand-400/10 text-brand-500')}
            >
              By Rank
            </button>
            <button
              onClick={() => setSortBy('price_change_percentage_24h')}
              className={clsx('btn-ghost text-xs', sortBy === 'price_change_percentage_24h' && 'bg-brand-50 dark:bg-brand-400/10 text-brand-500')}
            >
              By 24h Change
            </button>
            <button onClick={refetch} className="btn-ghost w-9 h-9 p-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        {error && (
          <div className="card border-red-200 dark:border-red-900/30 text-red-500 text-sm mb-4">{error}</div>
        )}

        {loading ? (
          <SkeletonTable rows={10} cols={6} />
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    {['#', 'Name', 'Price', '24h %', 'Market Cap', '7d Chart'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {filtered.map(coin => {
                    const isInvestable = INVESTABLE.includes(coin.id)
                    const isUp = coin.price_change_percentage_24h >= 0

                    return (
                      <tr
                        key={coin.id}
                        className={clsx(
                          'transition-colors hover:bg-gray-50 dark:hover:bg-white/5',
                          isInvestable && 'bg-brand-50/30 dark:bg-brand-400/5'
                        )}
                      >
                        <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-400 w-10">{coin.market_cap_rank}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">{coin.name}</span>
                                {isInvestable && <Star className="w-3 h-3 fill-brand-400 text-brand-400" />}
                              </div>
                              <span className="text-xs text-gray-400 dark:text-gray-400 uppercase">{coin.symbol}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {fmt.usd(coin.current_price, coin.current_price < 1 ? 4 : 2)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            'flex items-center gap-1 text-sm font-semibold',
                            isUp ? 'text-emerald-500' : 'text-red-500'
                          )}>
                            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {fmt.pct(coin.price_change_percentage_24h)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          ${fmt.compact(coin.market_cap)}
                        </td>
                        <td className="px-4 py-3">
                          <Sparkline data={coin.sparkline_in_7d?.price ?? []} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
