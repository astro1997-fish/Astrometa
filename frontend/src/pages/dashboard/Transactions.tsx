import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, BarChart3, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Badge, SkeletonTable } from '@/components/ui/index'
import { clsx } from 'clsx'

interface Tx {
  id: string
  type: 'deposit' | 'withdrawal' | 'investment'
  amount_usd: number
  method: string
  status: 'pending' | 'confirmed' | 'failed'
  tx_hash: string | null
  created_at: string
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const PAGE = 10

export default function Transactions() {
  const { user } = useAuth()
  const [txns, setTxns]       = useState<Tx[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<'all' | 'deposit' | 'withdrawal' | 'investment'>('all')
  const [search, setSearch]   = useState('')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)

    if (filter !== 'all') q = q.eq('type', filter)

    q.then(({ data, count }) => {
      setTxns(data ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    })
  }, [user, page, filter])

  const totalPages = Math.ceil(total / PAGE)

  const statusBadge = (s: string) => {
    if (s === 'confirmed') return <Badge variant="green">Confirmed</Badge>
    if (s === 'failed')    return <Badge variant="red">Failed</Badge>
    return <Badge variant="gold">Pending</Badge>
  }

  const typeIcon = (t: string) => {
    if (t === 'deposit')    return <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
    if (t === 'withdrawal') return <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
    return <BarChart3 className="w-3.5 h-3.5 text-brand-400" />
  }

  const typeBg = (t: string) => {
    if (t === 'deposit')    return 'bg-emerald-100 dark:bg-emerald-900/20'
    if (t === 'withdrawal') return 'bg-red-100 dark:bg-red-900/20'
    return 'bg-brand-50 dark:bg-brand-400/10'
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Full history of deposits, withdrawals and investments</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by method or hash..."
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl">
          {(['all', 'deposit', 'withdrawal', 'investment'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0) }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                filter === f
                  ? 'bg-white dark:bg-[#0D1627] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-4"><SkeletonTable rows={8} cols={5} /></div>
        ) : txns.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-400 text-sm">No transactions found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    {['Type', 'Amount', 'Method', 'Status', 'Date', 'Hash'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {txns.filter(tx =>
                    !search || tx.method.toLowerCase().includes(search.toLowerCase()) ||
                    (tx.tx_hash ?? '').toLowerCase().includes(search.toLowerCase())
                  ).map((tx, i) => (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center', typeBg(tx.type))}>
                            {typeIcon(tx.type)}
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{tx.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'text-sm font-bold',
                          tx.type === 'deposit' ? 'text-emerald-500' : tx.type === 'withdrawal' ? 'text-red-400' : 'text-brand-400'
                        )}>
                          {tx.type === 'withdrawal' ? '-' : '+'}{fmt(tx.amount_usd)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400 uppercase">{tx.method}</span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(tx.status)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        {tx.tx_hash ? (
                          <a
                            href={`https://etherscan.io/tx/${tx.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-brand-400 text-xs hover:underline"
                          >
                            {tx.tx_hash.slice(0, 8)}…{tx.tx_hash.slice(-6)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
                <p className="text-xs text-gray-400 dark:text-gray-400">
                  Showing {page * PAGE + 1}–{Math.min(page * PAGE + PAGE, total)} of {total}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="btn-ghost w-8 h-8 p-0 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={clsx(
                        'w-8 h-8 rounded-lg text-xs font-medium transition-all',
                        i === page
                          ? 'bg-brand-500 text-white'
                          : 'btn-ghost'
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="btn-ghost w-8 h-8 p-0 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
