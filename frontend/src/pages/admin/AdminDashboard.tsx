import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, DollarSign, TrendingUp, Clock, Radio, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonCard } from '@/components/ui/index'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function fmtRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60)  return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  return `${Math.round(diffSec / 3600)}h ago`
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

function BlockchainListenerCard() {
  const [health, setHealth]     = useState<ListenerHealth | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [error, setError]        = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function poll() {
    try {
      const res = await fetch('/health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setHealth(json.listener as ListenerHealth)
      setFetchedAt(new Date())
      setError(false)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Derived display state
  const isUnhealthy = error || (health !== null && health.active && !health.healthy)
  const isWarning   = !isUnhealthy && health?.silenceWarning
  const isInactive  = health !== null && !health.active

  let StatusIcon = CheckCircle2
  let iconColor  = 'text-emerald-400'
  let badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  let badgeLabel = 'Healthy'

  if (isUnhealthy) {
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
  const [stats, setStats]   = useState({ users: 0, deposits: 0, invested: 0, pendingWithdrawals: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('users').select('id', { count: 'exact' }),
      supabase.from('transactions').select('amount_usd').eq('type', 'deposit').eq('status', 'confirmed'),
      supabase.from('investments').select('amount_usd').eq('status', 'active'),
      supabase.from('withdrawals').select('id', { count: 'exact' }).eq('status', 'pending'),
    ]).then(([u, d, inv, w]) => {
      setStats({
        users: u.count ?? 0,
        deposits: (d.data ?? []).reduce((s: number, t: any) => s + t.amount_usd, 0),
        invested: (inv.data ?? []).reduce((s: number, i: any) => s + i.amount_usd, 0),
        pendingWithdrawals: w.count ?? 0,
      })
      setLoading(false)
    })
  }, [])

  const CARDS = [
    { label: 'Total Users',           value: stats.users.toString(),              icon: Users,        color: 'text-brand-400' },
    { label: 'Total Deposits',        value: fmt(stats.deposits),                 icon: DollarSign,   color: 'text-emerald-400' },
    { label: 'Active AUM',            value: fmt(stats.invested),                 icon: TrendingUp,   color: 'text-violet-400' },
    { label: 'Pending Withdrawals',   value: stats.pendingWithdrawals.toString(), icon: Clock,        color: 'text-amber-400' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Platform overview and management controls</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={2} />)
          : CARDS.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="card">
                <div className={`w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3 ${c.color}`}>
                  <c.icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{c.label}</p>
              </motion.div>
            ))
        }
      </div>
      <BlockchainListenerCard />
    </div>
  )
}
