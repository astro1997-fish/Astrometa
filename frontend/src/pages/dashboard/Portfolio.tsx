import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PieChart as PieIcon, History, Eye, EyeOff, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SkeletonCard } from '@/components/ui/index'
import { clsx } from 'clsx'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

interface Investment {
  id: string
  package_type: 'silver' | 'gold' | 'platinum'
  amount_usd: number
  start_date: string
  projected_return_pct: string
  status: string
  manager_name: string
}

interface Balance { unified_usd_balance: number }
interface PortfolioPoint { created_at: string; new_balance: number }

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0)

const PKG_META: Record<string, { icon: string; color: string }> = {
  silver:   { icon: '🥈', color: '#94A3B8' },
  gold:     { icon: '🥇', color: '#F59E0B' },
  platinum: { icon: '💎', color: '#8B5CF6' },
}

const RANGES: { label: string; days: number | null }[] = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'YTD', days: null },
  { label: 'All', days: null },
]

export default function Portfolio() {
  const { user, profile } = useAuth()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [balance, setBalance]         = useState<Balance | null>(null)
  const [history, setHistory]         = useState<PortfolioPoint[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(false)
  const [hideBalance, setHideBalance] = useState(false)
  const [range, setRange]             = useState('24H')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    Promise.all([
      supabase.from('investments').select('*').eq('user_id', user.id).order('start_date', { ascending: false }),
      supabase.from('balances').select('unified_usd_balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('portfolio_updates').select('created_at, new_balance').eq('user_id', user.id).order('created_at').limit(365),
    ])
      .then(([inv, bal, pu]) => {
        if (cancelled) return
        if (inv.error || bal.error) {
          setLoadError(true)
          return
        }
        setInvestments(inv.data ?? [])
        setBalance(bal.data)
        setHistory(pu.error ? [] : pu.data ?? [])
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  const totalInvested = investments.reduce((s, i) => s + i.amount_usd, 0)
  const totalBalance   = balance?.unified_usd_balance ?? 0

  const activeRange = RANGES.find(r => r.label === range) ?? RANGES[0]

  // Points within the selected window, falling back to the full history when there isn't enough data yet.
  const windowed = useMemo(() => {
    if (history.length === 0) return []
    if (activeRange.days == null) return history // YTD/All: show everything we have
    const cutoff = Date.now() - activeRange.days * 24 * 60 * 60 * 1000
    const filtered = history.filter(p => new Date(p.created_at).getTime() >= cutoff)
    return filtered.length >= 2 ? filtered : history
  }, [history, activeRange])

  const sparkline = useMemo(() => {
    if (windowed.length > 0) return windowed.map(p => ({ v: p.new_balance }))
    if (!balance) return []
    const base = balance.unified_usd_balance
    return [
      { v: base * 0.9 }, { v: base * 0.95 }, { v: base * 0.88 },
      { v: base * 0.97 }, { v: base * 0.93 }, { v: base * 1.0 }, { v: base },
    ]
  }, [windowed, balance])

  const periodStart = windowed.length > 0 ? windowed[0].new_balance : sparkline[0]?.v ?? totalBalance
  const change       = totalBalance - periodStart
  const changePct     = periodStart !== 0 ? (change / periodStart) * 100 : 0
  const isPositive    = change >= 0

  const initial = (profile?.full_name ?? user?.user_metadata?.full_name ?? 'A').charAt(0).toUpperCase()

  const holdings = useMemo(() => investments.map(inv => {
    const startTime = new Date(inv.start_date).getTime()
    const years = Number.isFinite(startTime) ? Math.max((Date.now() - startTime) / (1000 * 60 * 60 * 24 * 365), 0) : 0
    const parsedPct = parseFloat(inv.projected_return_pct || '0')
    const pct = Number.isFinite(parsedPct) ? parsedPct / 100 : 0
    const amount = Number.isFinite(inv.amount_usd) ? inv.amount_usd : 0
    const current = amount * (1 + pct * years)
    return { ...inv, amount_usd: amount, current, gain: current - amount }
  }), [investments])

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portfolio</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Your active and historical investments</p>
        </div>
        <Link to="/packages" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New Investment
        </Link>
      </div>

      {loading ? (
        <SkeletonCard lines={5} />
      ) : loadError ? (
        <div className="card flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Couldn't load your portfolio</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Please refresh the page or try again shortly.</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-gradient-brand text-white border-0 overflow-hidden relative"
        >
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">{(profile?.full_name ?? user?.user_metadata?.full_name) || 'Investor'}</span>
            </div>
            <div className="w-7 h-7 rounded-full bg-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
              {initial}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <p className="text-3xl sm:text-4xl font-black tracking-tight">
              {hideBalance ? '••••••' : fmt(totalBalance)}
            </p>
            <button
              onClick={() => setHideBalance(v => !v)}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Toggle balance visibility"
            >
              {hideBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className={clsx(
              'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md',
              isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            )}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
            </span>
            <span className={clsx('text-sm font-medium', isPositive ? 'text-emerald-400' : 'text-red-400')}>
              {isPositive ? '+' : '-'}{fmt(Math.abs(change))}
            </span>
            <span className="text-xs text-gray-500">({range})</span>
          </div>

          {sparkline.length > 1 && (
            <div className="h-20 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkline} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B7EF6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3B7EF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ background: '#0D1627', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 11 }}
                    labelFormatter={() => ''}
                    formatter={(v: number) => [fmt(v), 'Balance']}
                  />
                  <Area type="monotone" dataKey="v" stroke="#3B7EF6" strokeWidth={2} fill="url(#sparkFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>
      )}

      {/* Analytics / History quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href="#allocation"
          className="card !py-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-brand-400/30 transition-colors"
        >
          <PieIcon className="w-4 h-4 text-brand-400" /> Analytics
        </a>
        <Link
          to="/dashboard/transactions"
          className="card !py-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-brand-400/30 transition-colors"
        >
          <History className="w-4 h-4 text-brand-400" /> History
        </Link>
      </div>

      {/* Timeframe pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {RANGES.map(r => (
          <button
            key={r.label}
            onClick={() => setRange(r.label)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
              range === r.label
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Holdings table */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonCard lines={4} /></div>
        ) : holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-5">
            <PieIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">No holdings yet</h3>
            <p className="text-sm text-gray-400 dark:text-gray-400 mb-5">Choose a package and start growing your portfolio.</p>
            <Link to="/packages" className="btn-primary">Explore Packages</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-white/5">
              <span>Package / Manager</span>
              <span className="text-right">Invested</span>
              <span className="text-right">Value / Gain</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {holdings.map((h, i) => {
                const meta = PKG_META[h.package_type] ?? { icon: '📦', color: '#3B7EF6' }
                const gainPositive = h.gain >= 0
                return (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="grid grid-cols-3 gap-2 px-5 py-4 items-center"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                        style={{ background: `${meta.color}20` }}
                      >
                        {meta.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize truncate">{h.package_type}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{h.manager_name || 'Assigned soon'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{fmt(h.amount_usd)}</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">+{h.projected_return_pct}%/yr</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(h.current)}</p>
                      <p className={clsx('text-[11px] font-medium', gainPositive ? 'text-emerald-500' : 'text-red-400')}>
                        {gainPositive ? '+' : ''}{fmt(h.gain)}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Allocation summary */}
      {!loading && holdings.length > 0 && (
        <motion.div id="allocation" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card scroll-mt-24">
          <p className="font-semibold text-gray-900 dark:text-white mb-4">Allocation</p>
          <div className="space-y-3">
            {holdings.map((h, i) => {
              const meta = PKG_META[h.package_type] ?? { icon: '📦', color: '#3B7EF6' }
              const pct = totalInvested > 0 ? (h.amount_usd / totalInvested) * 100 : 0
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-600 dark:text-gray-300 capitalize">{h.package_type}</span>
                    <span className="text-gray-400 dark:text-gray-500">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
