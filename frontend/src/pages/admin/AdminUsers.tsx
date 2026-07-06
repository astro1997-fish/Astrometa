import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge, SkeletonTable } from '@/components/ui/index'
import { Check, X, Search, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

// ── Admin Users ───────────────────────────────────────────────────
export default function AdminUsers() {
  const [users, setUsers]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    supabase.from('users').select('*, balances(unified_usd_balance)').order('created_at', { ascending: false })
      .then(({ data }) => { setUsers(data ?? []); setLoading(false) })
  }, [])

  const filtered = users.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{users.length} total registered users</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="input pl-9" />
      </div>
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonTable rows={8} cols={5} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5">
                  {['Name', 'Email', 'Country', 'Balance', 'Role', 'Joined'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{u.country}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                      {fmt(u.balances?.[0]?.unified_usd_balance ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'violet' : 'blue'}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin Withdrawals ─────────────────────────────────────────────
export function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    supabase.from('withdrawals')
      .select('*, users!inner(full_name, email)')
      .order('requested_at', { ascending: false })
      .then(({ data }) => { setWithdrawals(data ?? []); setLoading(false) })
  }, [])

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    await supabase.from('withdrawals').update({ status, processed_at: new Date().toISOString() }).eq('id', id)
    setWithdrawals(ws => ws.map(w => w.id === id ? { ...w, status } : w))
    toast.success(`Withdrawal ${status}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Withdrawal Requests</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{withdrawals.filter(w => w.status === 'pending').length} pending approvals</p>
      </div>
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonTable rows={6} cols={6} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5">
                  {['User', 'Amount', 'Method', 'Destination', 'Status', 'Requested', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {withdrawals.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{w.users?.full_name}</p>
                      <p className="text-xs text-gray-400">{w.users?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-red-400">{fmt(w.amount_usd)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 uppercase">{w.method}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-50 dark:bg-white/5 px-2 py-0.5 rounded font-mono truncate block max-w-[140px]">{w.destination}</code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={w.status === 'approved' ? 'green' : w.status === 'rejected' ? 'red' : 'gold'}>
                        {w.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(w.requested_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {w.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => updateStatus(w.id, 'approved')}
                            className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-200 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => updateStatus(w.id, 'rejected')}
                            className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-200 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin Deposit Addresses ───────────────────────────────────────
export function AdminAddresses() {
  const [addresses, setAddresses] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState({ coin: 'btc', chain: 'btc', address: '' })
  const [adding, setAdding]       = useState(false)

  useEffect(() => {
    supabase.from('deposit_addresses').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAddresses(data ?? []); setLoading(false) })
  }, [])

  const addAddress = async () => {
    if (!form.address) return
    setAdding(true)
    const { data, error } = await supabase.from('deposit_addresses').insert({ ...form, is_active: true }).select().single()
    if (!error && data) setAddresses(a => [data, ...a])
    setForm(f => ({ ...f, address: '' }))
    setAdding(false)
    toast.success('Address added!')
  }

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('deposit_addresses').update({ is_active: !current }).eq('id', id)
    setAddresses(a => a.map(addr => addr.id === id ? { ...addr, is_active: !current } : addr))
  }

  const deleteAddress = async (id: string) => {
    await supabase.from('deposit_addresses').delete().eq('id', id)
    setAddresses(a => a.filter(addr => addr.id !== id))
    toast.success('Address removed')
  }

  const COINS = ['btc', 'eth', 'usdc', 'usdt']
  const CHAINS: Record<string, string[]> = {
    btc:  ['btc'],
    eth:  ['eth'],
    usdc: ['erc20'],
    usdt: ['erc20', 'trc20', 'bep20'],
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Deposit Addresses</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage crypto wallet addresses shown to investors</p>
      </div>

      {/* Add form */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Plus className="w-4 h-4 text-brand-400" /> Add New Address</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select value={form.coin} onChange={e => setForm(f => ({ ...f, coin: e.target.value, chain: CHAINS[e.target.value][0] }))} className="input text-sm">
            {COINS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <select value={form.chain} onChange={e => setForm(f => ({ ...f, chain: e.target.value }))} className="input text-sm">
            {(CHAINS[form.coin] ?? []).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <input
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Wallet address..."
            className="input text-sm sm:col-span-2"
          />
        </div>
        <button onClick={addAddress} disabled={adding || !form.address} className="btn-primary text-sm">
          {adding ? 'Adding...' : 'Add Address'}
        </button>
      </div>

      {/* Address list */}
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonTable rows={4} cols={4} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5">
                  {['Coin', 'Chain', 'Address', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {addresses.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white uppercase">{a.coin}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 uppercase">{a.chain}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-gray-600 dark:text-gray-300">{a.address.slice(0, 16)}…{a.address.slice(-10)}</code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.is_active ? 'green' : 'gray'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => toggleActive(a.id, a.is_active)} className="text-xs text-brand-400 hover:underline">
                          {a.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => deleteAddress(a.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin Audit Logs ──────────────────────────────────────────────
export function AdminAuditLogs() {
  const [logs, setLogs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('audit_logs')
      .select('*, users!inner(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data ?? []); setLoading(false) })
  }, [])

  const actionColor = (action: string) => {
    if (action === 'deposit_admin_retry') return 'badge-violet'
    if (action.includes('login'))    return 'badge-blue'
    if (action.includes('deposit'))  return 'badge-green'
    if (action.includes('withdraw')) return 'badge-gold'
    if (action.includes('fail'))     return 'badge-red'
    return 'badge-gray'
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Last 100 platform events</p>
      </div>
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonTable rows={10} cols={4} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5">
                  {['User', 'Action', 'Metadata', 'IP', 'Time'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-900 dark:text-white">{log.users?.full_name}</p>
                      <p className="text-[10px] text-gray-400">{log.users?.email}</p>
                    </td>
                    <td className="px-4 py-3"><span className={clsx('badge text-[11px]', actionColor(log.action))}>{log.action}</span></td>
                    <td className="px-4 py-3">
                      <code className="text-[10px] text-gray-400 font-mono">{log.metadata ? JSON.stringify(JSON.parse(log.metadata)).slice(0, 40) : '—'}</code>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ip_address ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
