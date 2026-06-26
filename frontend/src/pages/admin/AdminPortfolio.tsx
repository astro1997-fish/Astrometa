import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Edit3, Send, TrendingUp, X, Check, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface InvestorRow {
  user_id: string
  full_name: string
  email: string
  package_type: string
  amount_usd: number
  start_date: string
  projected_return_pct: string
  status: string
  manager_name: string
  balance: number
  investment_id: string
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function AdminPortfolio() {
  const [investors, setInvestors] = useState<InvestorRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<InvestorRow | null>(null)

  // Edit state
  const [newBalance,     setNewBalance]     = useState('')
  const [profitLoss,     setProfitLoss]     = useState('')
  const [returnRate,     setReturnRate]     = useState('')
  const [status,         setEditStatus]     = useState('')
  const [manager,        setManager]        = useState('')
  const [adminNote,      setAdminNote]      = useState('')
  const [msgSubject,     setMsgSubject]     = useState('')
  const [msgBody,        setMsgBody]        = useState('')
  const [saving,         setSaving]         = useState(false)
  const [sendingMsg,     setSendingMsg]     = useState(false)
  const [showMsgForm,    setShowMsgForm]    = useState(false)

  useEffect(() => {
    supabase
      .from('investments')
      .select(`
        id,
        user_id,
        package_type,
        amount_usd,
        start_date,
        projected_return_pct,
        status,
        manager_name,
        users!inner(full_name, email),
        balances!inner(unified_usd_balance)
      `)
      .then(({ data }) => {
        const rows: InvestorRow[] = (data ?? []).map((d: any) => ({
          investment_id:       d.id,
          user_id:             d.user_id,
          full_name:           d.users.full_name,
          email:               d.users.email,
          package_type:        d.package_type,
          amount_usd:          d.amount_usd,
          start_date:          d.start_date,
          projected_return_pct: d.projected_return_pct,
          status:              d.status,
          manager_name:        d.manager_name,
          balance:             d.balances.unified_usd_balance,
        }))
        setInvestors(rows)
        setLoading(false)
      })
  }, [])

  const openEditor = (inv: InvestorRow) => {
    setSelected(inv)
    setNewBalance(inv.balance.toString())
    setProfitLoss('')
    setReturnRate(inv.projected_return_pct)
    setEditStatus(inv.status)
    setManager(inv.manager_name)
    setAdminNote('')
    setShowMsgForm(false)
  }

  const saveUpdate = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const nb = parseFloat(newBalance)

      // Log portfolio update
      await supabase.from('portfolio_updates').insert({
        investment_id:    selected.investment_id,
        user_id:          selected.user_id,
        previous_balance: selected.balance,
        new_balance:      nb,
        change_amount:    nb - selected.balance,
        change_pct:       ((nb - selected.balance) / selected.balance * 100).toFixed(2),
        note:             adminNote,
        updated_by_admin: true,
      })

      // Update balances
      await supabase.from('balances').update({ unified_usd_balance: nb }).eq('user_id', selected.user_id)

      // Update investment
      await supabase.from('investments').update({
        projected_return_pct: returnRate,
        status,
        manager_name:         manager,
      }).eq('id', selected.investment_id)

      // Refresh local state
      setInvestors(inv => inv.map(i =>
        i.investment_id === selected.investment_id
          ? { ...i, balance: nb, projected_return_pct: returnRate, status, manager_name: manager }
          : i
      ))
      setSelected(prev => prev ? { ...prev, balance: nb, projected_return_pct: returnRate, status, manager_name: manager } : null)
      toast.success('Portfolio updated!')
    } catch {
      toast.error('Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const sendMessage = async () => {
    if (!selected || !msgSubject || !msgBody) return
    setSendingMsg(true)
    await supabase.from('admin_messages').insert({
      user_id:    selected.user_id,
      from_admin: true,
      subject:    msgSubject,
      body:       msgBody,
      read:       false,
    })
    setSendingMsg(false)
    toast.success(`Message sent to ${selected.full_name}`)
    setMsgSubject('')
    setMsgBody('')
    setShowMsgForm(false)
  }

  const filtered = investors.filter(i =>
    !search ||
    i.full_name.toLowerCase().includes(search.toLowerCase()) ||
    i.email.toLowerCase().includes(search.toLowerCase()) ||
    i.package_type.toLowerCase().includes(search.toLowerCase())
  )

  const pkgBadgeClass: Record<string, string> = {
    silver:   'badge-blue',
    gold:     'badge-gold',
    platinum: 'badge-violet',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portfolio Manager</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{investors.length} active portfolios</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Investor table */}
        <div className="xl:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, package..." className="input pl-9" />
          </div>

          <div className="card p-0 overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3 animate-pulse">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                      {['Investor', 'Package', 'Invested', 'Balance', 'Return', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                    {filtered.map(inv => (
                      <tr
                        key={inv.investment_id}
                        onClick={() => openEditor(inv)}
                        className={clsx(
                          'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/5',
                          selected?.investment_id === inv.investment_id && 'bg-brand-50/50 dark:bg-brand-400/5'
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.full_name}</p>
                          <p className="text-xs text-gray-400">{inv.email}</p>
                        </td>
                        <td className="px-4 py-3"><span className={clsx('badge capitalize', pkgBadgeClass[inv.package_type])}>{inv.package_type}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{fmt(inv.amount_usd)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{fmt(inv.balance)}</td>
                        <td className="px-4 py-3 text-sm text-emerald-500 font-semibold">+{inv.projected_return_pct}%</td>
                        <td className="px-4 py-3"><span className={clsx('badge', inv.status === 'active' ? 'badge-green' : 'badge-gray')}>{inv.status}</span></td>
                        <td className="px-4 py-3"><Edit3 className="w-3.5 h-3.5 text-gray-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Edit panel */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className="card space-y-4 h-fit"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{selected.full_name}</h3>
                  <p className="text-xs text-gray-400">{selected.email}</p>
                </div>
                <button onClick={() => setSelected(null)} className="btn-ghost w-7 h-7 p-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-400">Package</span><span className="font-semibold capitalize">{selected.package_type}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Invested</span><span className="font-semibold">{fmt(selected.amount_usd)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Current Balance</span><span className="font-bold text-emerald-500">{fmt(selected.balance)}</span></div>
              </div>

              {/* Fields */}
              {[
                { label: 'New Balance (USD)', val: newBalance, set: setNewBalance, type: 'number', prefix: '$' },
                { label: 'Return Rate (%/yr)', val: returnRate, set: setReturnRate, type: 'number' },
                { label: 'Account Manager', val: manager, set: setManager, type: 'text' },
              ].map(({ label, val, set, type, prefix }, i) => (
                <div key={i}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                  <div className="relative">
                    {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
                    <input
                      type={type}
                      value={val}
                      onChange={e => set(e.target.value)}
                      className={clsx('input text-sm py-2', prefix && 'pl-6')}
                    />
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select value={status} onChange={e => setEditStatus(e.target.value)} className="input text-sm py-2">
                  {['active', 'on_hold', 'matured', 'closed', 'cancelled'].map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Admin Note (internal)</label>
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  rows={2}
                  className="input text-sm py-2 resize-none"
                  placeholder="Internal note about this update..."
                />
              </div>

              <button onClick={saveUpdate} disabled={saving} className="btn-primary w-full justify-center text-sm">
                <TrendingUp className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Daily Update'}
              </button>

              {/* Message form */}
              <div className="border-t border-gray-100 dark:border-white/5 pt-3">
                <button
                  onClick={() => setShowMsgForm(v => !v)}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-brand-400" /> Send Message to Investor</span>
                  <ChevronDown className={clsx('w-4 h-4 transition-transform', showMsgForm && 'rotate-180')} />
                </button>

                <AnimatePresence>
                  {showMsgForm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 pt-3">
                        <input
                          value={msgSubject}
                          onChange={e => setMsgSubject(e.target.value)}
                          placeholder="Message subject"
                          className="input text-sm py-2"
                        />
                        <textarea
                          value={msgBody}
                          onChange={e => setMsgBody(e.target.value)}
                          rows={3}
                          placeholder="Message body..."
                          className="input text-sm py-2 resize-none"
                        />
                        <button onClick={sendMessage} disabled={sendingMsg} className="btn-secondary w-full justify-center text-xs py-2">
                          <Send className="w-3 h-3" />
                          {sendingMsg ? 'Sending...' : 'Send Message'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
