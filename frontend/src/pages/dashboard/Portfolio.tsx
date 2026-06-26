import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingUp, Calendar, User, AlertCircle, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { SkeletonCard, Badge } from '@/components/ui/index'
import { clsx } from 'clsx'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Investment {
  id: string
  package_type: 'silver' | 'gold' | 'platinum'
  amount_usd: number
  start_date: string
  projected_return_pct: string
  status: string
  manager_name: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const PKG_COLORS: Record<string, string> = {
  silver: '#3B7EF6',
  gold: '#F59E0B',
  platinum: '#8B5CF6',
}

const STATUS_BADGE: Record<string, 'green' | 'blue' | 'gold' | 'gray' | 'red'> = {
  active: 'green',
  completed: 'blue',
  on_hold: 'gold',
  cancelled: 'red',
  matured: 'violet' as any,
}

export default function Portfolio() {
  const { user } = useAuth()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setInvestments(data ?? [])
        setLoading(false)
      })
  }, [user])

  const totalInvested = investments.reduce((s, i) => s + i.amount_usd, 0)
  const activeCount   = investments.filter(i => i.status === 'active').length

  const pieData = investments.map(i => ({
    name: i.package_type.charAt(0).toUpperCase() + i.package_type.slice(1),
    value: i.amount_usd,
    color: PKG_COLORS[i.package_type],
  }))

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

      {/* Summary cards */}
      {!loading && investments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Invested', value: fmt(totalInvested), sub: `Across ${investments.length} package${investments.length > 1 ? 's' : ''}` },
            { label: 'Active Packages', value: activeCount.toString(), sub: 'Currently running' },
            { label: 'Avg. Projected Return', value: `${(investments.reduce((s, i) => s + parseFloat(i.projected_return_pct || '0'), 0) / investments.length).toFixed(1)}%`, sub: 'Annualised' },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Investment cards */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} lines={4} />)
          ) : investments.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">No investments yet</h3>
              <p className="text-sm text-gray-400 mb-5">Choose a package and start growing your portfolio.</p>
              <Link to="/packages" className="btn-primary">Explore Packages</Link>
            </div>
          ) : (
            investments.map((inv, i) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="card hover:border-brand-400/20 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: `${PKG_COLORS[inv.package_type]}20` }}>
                      {inv.package_type === 'silver' ? '🥈' : inv.package_type === 'gold' ? '🥇' : '💎'}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white capitalize">{inv.package_type} Package</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={(STATUS_BADGE[inv.status] ?? 'gray') as any}>
                          {inv.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="text-xl font-black text-gray-900 dark:text-white">{fmt(inv.amount_usd)}</p>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-white/5">
                  <div>
                    <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                      <Calendar className="w-3 h-3" /> Started
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(inv.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                      <TrendingUp className="w-3 h-3" /> Projected Return
                    </div>
                    <p className="text-sm font-bold text-emerald-500">+{inv.projected_return_pct}% /yr</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                      <User className="w-3 h-3" /> Manager
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.manager_name || 'Assigned Soon'}</p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Donut chart */}
        {!loading && pieData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card">
            <p className="font-semibold text-gray-900 dark:text-white mb-4">Allocation Breakdown</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [fmt(v), 'Invested']}
                  contentStyle={{ background: '#0D1627', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                />
                <Legend formatter={(value) => <span className="text-xs text-gray-400">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-2">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    <span className="text-gray-600 dark:text-gray-400">{d.name}</span>
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
