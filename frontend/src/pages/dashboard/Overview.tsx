import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, Wallet, ArrowUpRight, ArrowDownLeft,
  Plus, ChevronRight, BarChart3, Mail
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SkeletonCard } from '@/components/ui/index'
import { clsx } from 'clsx'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'

interface Balance    { unified_usd_balance: number }
interface Investment { id: string; package_type: string; amount_usd: number; projected_return_pct: string; status: string; manager_name: string }
interface Transaction{ id: string; type: string; amount_usd: number; method: string; status: string; created_at: string }
const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function Overview() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()

  const [balance,      setBalance]      = useState<Balance | null>(null)
  const [investment,   setInvestment]   = useState<Investment | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [chartData,    setChartData]    = useState<{ date: string; value: number }[]>([])
  const [unreadMsgs,   setUnreadMsgs]   = useState(0)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('balances').select('unified_usd_balance').eq('user_id', user.id).single(),
      supabase.from('investments').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('portfolio_updates').select('created_at, new_balance').eq('user_id', user.id).order('created_at').limit(30),
      supabase.from('admin_messages').select('id').eq('user_id', user.id).eq('read', false),
    ]).then(([b, inv, tx, pu, msgs]) => {
      if (b.data)    setBalance(b.data)
      if (inv.data)  setInvestment(inv.data)
      if (tx.data)   setTransactions(tx.data)
      if (msgs.data) setUnreadMsgs(msgs.data.length)
      if (pu.data && pu.data.length > 0) {
        setChartData(pu.data.map(p => ({
          date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: p.new_balance,
        })))
      } else if (b.data) {
        // Seed chart with current balance
        const base = b.data.unified_usd_balance
        setChartData([
          { date: 'Start', value: base * 0.92 },
          { date: 'Week 1', value: base * 0.95 },
          { date: 'Week 2', value: base * 0.97 },
          { date: 'Week 3', value: base * 0.99 },
          { date: 'Today',  value: base },
        ])
      }
      setLoading(false)
    })
  }, [user])

  const pkgColor: Record<string, string> = {
    silver: 'badge-blue',
    gold: 'badge-gold',
    platinum: 'badge-violet',
  }

  const txIcon = (type: string) => {
    if (type === 'deposit')    return <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
    if (type === 'withdrawal') return <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
    return <BarChart3 className="w-3.5 h-3.5 text-brand-400" />
  }

  const txColor = (type: string) =>
    type === 'deposit' ? 'text-emerald-500' : type === 'withdrawal' ? 'text-red-400' : 'text-brand-400'

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {profile?.full_name?.split(' ')[0] ?? 'Investor'} 👋
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Here's your portfolio summary for {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={2} />)
        ) : (
          <>
            {/* Balance */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="card lg:col-span-2 bg-gradient-brand text-white border-0 relative overflow-hidden"
            >
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/5" />
              <div className="absolute -right-2 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide mb-1">{t('dashboard.totalBalance')}</p>
              <p className="text-4xl font-black mb-3">
                {fmt(balance?.unified_usd_balance ?? 0)}
              </p>
              <div className="flex gap-3">
                <Link to="/dashboard/fund" className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all">
                  <Plus className="w-3 h-3" /> Fund
                </Link>
                <Link to="/dashboard/withdraw" className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all">
                  <ArrowUpRight className="w-3 h-3" /> Withdraw
                </Link>
              </div>
            </motion.div>

            {/* Active package */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="card"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('dashboard.activePackage')}</p>
              {investment ? (
                <>
                  <span className={clsx('badge mb-2 capitalize', pkgColor[investment.package_type])}>
                    {investment.package_type}
                  </span>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmt(investment.amount_usd)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Managed by {investment.manager_name || 'Expert Team'}</p>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-gray-400">No active investment</p>
                  <Link to="/packages" className="btn-primary text-xs py-1.5 justify-center">Start Investing</Link>
                </div>
              )}
            </motion.div>

            {/* Projected earnings */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('dashboard.projectedEarnings')}</p>
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {investment
                    ? `+${investment.projected_return_pct}%`
                    : '—'
                  }
                </span>
              </div>
              <p className="text-xs text-gray-400">Projected annual return</p>
              {unreadMsgs > 0 && (
                <Link
                  to="/dashboard/messages"
                  className="flex items-center gap-1.5 mt-3 text-xs text-brand-400 hover:underline"
                >
                  <Mail className="w-3 h-3" />
                  {unreadMsgs} new message{unreadMsgs > 1 ? 's' : ''} from your manager
                </Link>
              )}
            </motion.div>
          </>
        )}
      </div>

      {/* Chart + recent transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Portfolio Performance</p>
              <p className="text-xs text-gray-400">Balance over time</p>
            </div>
            <span className="badge-green text-xs">Live</span>
          </div>
          {loading ? (
            <div className="h-48 skeleton rounded-xl" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B7EF6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B7EF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    background: '#0D1627', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, fontSize: 12
                  }}
                  formatter={(v: number) => [fmt(v), 'Balance']}
                />
                <Area type="monotone" dataKey="value" stroke="#3B7EF6" strokeWidth={2}
                  fill="url(#colorVal)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              Performance data will appear after your first deposit.
            </div>
          )}
        </motion.div>

        {/* Recent transactions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-gray-900 dark:text-white">{t('dashboard.recentTransactions')}</p>
            <Link to="/dashboard/transactions" className="text-xs text-brand-400 hover:underline flex items-center gap-0.5">
              {t('dashboard.viewAll')} <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-24" />
                    <div className="skeleton h-2.5 w-16" />
                  </div>
                  <div className="skeleton h-3 w-16" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Wallet className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">{t('dashboard.noTransactions')}</p>
              <Link to="/dashboard/fund" className="btn-primary mt-3 text-xs py-1.5">{t('dashboard.fundNow')}</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    tx.type === 'deposit'    && 'bg-emerald-100 dark:bg-emerald-900/20',
                    tx.type === 'withdrawal' && 'bg-red-100 dark:bg-red-900/20',
                    tx.type === 'investment' && 'bg-brand-50 dark:bg-brand-400/10',
                  )}>
                    {txIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white capitalize">{tx.type}</p>
                    <p className="text-[10px] text-gray-400 uppercase">{tx.method}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={clsx('text-xs font-bold', txColor(tx.type))}>
                      {tx.type === 'withdrawal' ? '-' : '+'}{fmt(tx.amount_usd)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
