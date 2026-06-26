import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, DollarSign, TrendingUp, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SkeletonCard } from '@/components/ui/index'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

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
    { label: 'Total Users',           value: stats.users.toString(),          icon: Users,        color: 'text-brand-400' },
    { label: 'Total Deposits',        value: fmt(stats.deposits),             icon: DollarSign,   color: 'text-emerald-400' },
    { label: 'Active AUM',            value: fmt(stats.invested),             icon: TrendingUp,   color: 'text-violet-400' },
    { label: 'Pending Withdrawals',   value: stats.pendingWithdrawals.toString(), icon: Clock,    color: 'text-amber-400' },
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
                <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
              </motion.div>
            ))
        }
      </div>
    </div>
  )
}
