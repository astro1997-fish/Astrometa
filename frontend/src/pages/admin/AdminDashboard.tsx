import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, DollarSign, TrendingUp, Clock, Radio, AlertTriangle, CheckCircle2, XCircle, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonCard } from '@/components/ui/index'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtPrice = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

function fmtRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60)  return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  return `${Math.round(diffSec / 3600)}h ago`
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}

interface ListenerHealth {
  active:         boolean
  lastEventAt:    string | null
  lastCheckedAt:  string | null
  healthy:        boolean
  silenceSec:     number | null
  silenceWarning: boolean
  message:        string
}

export interface EthPriceStatus {
  price:             number | null
  fetchedAt:         string | null
  ageSec:            number | null
  stale:             boolean
  staleThresholdSec: number
}

function EthPriceCard({ ethPrice, error }: { ethPrice: EthPriceStatus | null; error: boolean }) {
  const isStale = error || ethPrice?.stale === true
  const hasPrice = ethPrice?.price !== null && ethPrice?.price !== undefined

  const StatusIcon = isStale ? AlertTriangle : Activity
  const iconColor   = isStale ? 'text-amber-400' : 'text-emerald-400'
  const badgeClass  = isStale
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  const badgeLabel  = isStale ? 'Stale' : 'Live'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.24 }}
      className="card col-span-2 lg:col-span-4"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center ${iconColor}`}>
            <StatusIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
              ETH Price Feed{hasPrice ? ` · ${fmtPrice(ethPrice!.price!)}` : ''}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {error
                ? 'Could not reach /health endpoint'
                : !ethPrice
                  ? 'Loading…'
                  : ethPrice.fetchedAt
                    ? `fetched ${fmtRelative(ethPrice.fetchedAt)} from CoinGecko`
                    : 'No price ever fetched — CoinGecko unreachable since startup'}
            </p>
          </div>
        </div>

        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      {isStale && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {ethPrice?.ageSec != null
              ? `The last live ETH price is ${fmtDuration(ethPrice.ageSec)} old (warning threshold: ${fmtDuration(ethPrice.staleThresholdSec)}). New ETH deposits may be mis-priced or stuck as "pending price" until CoinGecko recovers.`
              : 'CoinGecko has never returned a price successfully. ETH deposits cannot be priced until the feed recovers.'}
          </p>
        </div>
      )}
    </motion.div>
  )
}

function BlockchainListenerCard({ health, fetchedAt, error, consecutiveFailures }: { health: ListenerHealth | null; fetchedAt: Date | null; error: boolean; consecutiveFailures: number }) {
  // If polling has failed for more than one consecutive cycle, the last-known
  // state is too old to trust — surface it as stale rather than letting a
  // green "Healthy" badge linger while the backend is unreachable.
  const isStaleData = consecutiveFailures > 1

  // Derived display state
  const isUnhealthy = !isStaleData && (error || (health !== null && health.active && !health.healthy))
  const isWarning   = !isStaleData && !isUnhealthy && health?.silenceWarning
  const isInactive  = !isStaleData && health !== null && !health.active

  let StatusIcon = CheckCircle2
  let iconColor  = 'text-emerald-400'
  let badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  let badgeLabel = 'Healthy'

  if (isStaleData) {
    StatusIcon = AlertTriangle
    iconColor  = 'text-gray-400'
    badgeClass = 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300'
    badgeLabel = 'Stale data'
  } else if (isUnhealthy) {
    StatusIcon = XCircle
    iconColor  = 'text-red-400'
    badgeClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    badgeLabel = 'Unhealthy'
  } else if (isWarning) {
    StatusIcon = AlertTriangle
    iconColor  = 'text-amber-400'
    badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    badgeLabel = 'Warning'
  } else if (isInactive) {
    StatusIcon = Radio
    iconColor  = 'text-gray-400'
    badgeClass = 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400'
    badgeLabel = 'Not configured'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
      className="card col-span-2 lg:col-span-4"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center ${iconColor}`}>
            <StatusIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Blockchain Listener</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {health ? health.message : error ? 'Could not reach /health endpoint' : 'Loading…'}
            </p>
          </div>
        </div>

        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      {health && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div>
            <p className="text-gray-400 dark:text-gray-500 mb-0.5">Last event</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">
              {fmtRelative(health.lastEventAt)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500 mb-0.5">Last health check</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">
              {fmtRelative(health.lastCheckedAt)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 dark:text-gray-500 mb-0.5">Dashboard polled</p>
            <p className="font-medium text-gray-700 dark:text-gray-200">
              {fetchedAt ? fmtRelative(fetchedAt.toISOString()) : '—'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3">
          <AlertTriangle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Data may be stale — the dashboard could not reach <code className="font-mono bg-gray-100 dark:bg-white/10 px-1 rounded">/health</code>{' '}
            on its last poll. Last successful fetch: {fetchedAt ? fmtRelative(fetchedAt.toISOString()) : 'never'}.
          </p>
        </div>
      )}

      {isUnhealthy && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">
            The blockchain listener is not healthy. Check that{' '}
            <code className="font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">ETH_RPC_URL</code> and{' '}
            <code className="font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">CONTRACT_ADDRESS</code> are set
            correctly, then restart the backend to reinitialise the listener.
          </p>
        </div>
      )}
    </motion.div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats]   = useState({ users: 0, deposits: 0, invested: 0, pendingWithdrawals: 0, pendingPriceCount: 0 })
  const [loading, setLoading] = useState(true)

  const [health, setHealth]       = useState<ListenerHealth | null>(null)
  const [ethPrice, setEthPrice]   = useState<EthPriceStatus | null>(null)
  const [healthFetchedAt, setHealthFetchedAt] = useState<Date | null>(null)
  const [healthError, setHealthError]         = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function pollHealth() {
      try {
        const res = await fetch('/health')
        if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setHealth(json.listener as ListenerHealth)
        setEthPrice(json.ethPrice as EthPriceStatus)
        setHealthFetchedAt(new Date())
        setHealthError(false)
        setConsecutiveFailures(0)
      } catch {
        setHealthError(true)
        setConsecutiveFailures((n) => n + 1)
      }
    }
    pollHealth()
    healthIntervalRef.current = setInterval(pollHealth, 60_000)
    return () => { if (healthIntervalRef.current) clearInterval(healthIntervalRef.current) }
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('users').select('id', { count: 'exact' }),
      supabase.from('transactions').select('amount_usd').eq('type', 'deposit').eq('status', 'confirmed'),
      supabase.from('investments').select('amount_usd').eq('status', 'active'),
      supabase.from('withdrawals').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('transactions').select('id', { count: 'exact' }).eq('type', 'deposit').eq('status', 'pending_price'),
    ]).then(([u, d, inv, w, pp]) => {
      setStats({
        users: u.count ?? 0,
        deposits: (d.data ?? []).reduce((s: number, t: any) => s + t.amount_usd, 0),
        invested: (inv.data ?? []).reduce((s: number, i: any) => s + i.amount_usd, 0),
        pendingWithdrawals: w.count ?? 0,
        pendingPriceCount: pp.count ?? 0,
      })
      setLoading(false)
    })
  }, [])

  const CARDS = [
    { label: 'Total Users',           value: stats.users.toString(),              icon: Users,        color: 'text-brand-400' },
    { label: 'Total Deposits',        value: fmt(stats.deposits),                 icon: DollarSign,   color: 'text-emerald-400' },
    { label: 'Active AUM',            value: fmt(stats.invested),                 icon: TrendingUp,   color: 'text-violet-400' },
    { label: 'Pending Withdrawals',   value: stats.pendingWithdrawals.toString(), icon: Clock,        color: 'text-amber-400' },
    {
      label: 'Pending Price Deposits',
      value: stats.pendingPriceCount.toString(),
      icon: AlertTriangle,
      color: stats.pendingPriceCount > 0 ? 'text-amber-400' : 'text-gray-400',
      warn: stats.pendingPriceCount > 0,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Platform overview and management controls</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} lines={2} />)
          : CARDS.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`card ${c.warn ? 'border-amber-300 dark:border-amber-800/50' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3 ${c.color}`}>
                  <c.icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{c.label}</p>
              </motion.div>
            ))
        }
      </div>
      <EthPriceCard ethPrice={ethPrice} error={healthError} />
      <BlockchainListenerCard health={health} fetchedAt={healthFetchedAt} error={healthError} consecutiveFailures={consecutiveFailures} />
    </div>
  )
}
