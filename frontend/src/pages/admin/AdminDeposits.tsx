import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, ExternalLink, X } from 'lucide-react'
import { Badge, SkeletonTable } from '@/components/ui/index'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { txExplorerUrl } from '@/lib/txLink'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

interface PendingDeposit {
  id: string
  user_id: string
  amount_usd: number
  tx_hash: string | null
  created_at: string
  method: string
  status: 'pending' | 'failed'
  users: { full_name: string; email: string }
}

interface RetryModal {
  deposit: PendingDeposit
  txHash: string
  amountUsd: string
  mode: 'chain' | 'manual'
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AdminDeposits() {
  const [deposits, setDeposits] = useState<PendingDeposit[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState<RetryModal | null>(null)
  const [retrying, setRetrying] = useState(false)

  const fetchDeposits = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const r = await fetch('/api/admin/deposits', { headers })
      const data = await r.json()
      setDeposits(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load deposits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDeposits() }, [])

  const openRetry = (deposit: PendingDeposit) => {
    setModal({ deposit, txHash: '', amountUsd: '', mode: 'chain' })
  }

  const submitRetry = async () => {
    if (!modal) return
    const { deposit, mode, txHash, amountUsd } = modal

    if (mode === 'chain' && !txHash.trim()) {
      toast.error('Enter the on-chain transaction hash')
      return
    }
    if (mode === 'manual' && (!amountUsd || isNaN(parseFloat(amountUsd)) || parseFloat(amountUsd) <= 0)) {
      toast.error('Enter a valid USD amount')
      return
    }

    setRetrying(true)
    try {
      const headers = await getAuthHeaders()
      const body: Record<string, any> = {}
      if (mode === 'chain')  body.txHash    = txHash.trim()
      if (mode === 'manual') body.amountUsd = parseFloat(amountUsd)

      const res  = await fetch(`/api/admin/deposits/${deposit.id}/retry`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Retry failed')
        return
      }

      if (data.credited) {
        toast.success(`Credited ${fmt(data.amountUsd)} — deposit confirmed!`)
      } else {
        toast(`Deposit was already confirmed (no double-credit applied)`, { icon: 'ℹ️' })
      }

      setModal(null)
      // Remove from pending list
      setDeposits(ds => ds.filter(d => d.id !== deposit.id))
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stuck Deposits</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Pending or failed crypto deposits where the blockchain listener may have missed the confirmation
          </p>
        </div>
        <button
          onClick={fetchDeposits}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30">
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          These deposits are stuck in <strong>pending</strong> — usually because the server was down when the on-chain
          confirmation arrived, or the ETH price fetch returned $0. Use <strong>Retry credit</strong> to re-query the
          chain and credit the user. The retry is idempotent — double-credits are impossible.
        </p>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : deposits.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No stuck deposits</p>
            <p className="text-xs text-gray-400 mt-1">All crypto deposits have been processed</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5">
                  {['User', 'Expected Amount', 'Payment ID (tx_hash)', 'Method', 'Status', 'Created', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                {deposits.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{d.users?.full_name}</p>
                      <p className="text-xs text-gray-400">{d.users?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                      {d.amount_usd > 0 ? fmt(d.amount_usd) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {d.tx_hash ? (
                        <div className="flex items-center gap-1.5">
                          <code className="text-[11px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 px-1.5 py-0.5 rounded truncate max-w-[160px]">
                            {d.tx_hash.slice(0, 10)}…{d.tx_hash.slice(-8)}
                          </code>
                          <a
                            href={txExplorerUrl(d.tx_hash, d.method)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-gray-400 hover:text-brand-400 transition-colors"
                            title={d.method === 'btc' ? 'View on mempool.space' : 'View on Etherscan'}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No hash</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="blue">{d.method ?? 'crypto'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={d.status === 'failed' ? 'red' : 'gold'}>{d.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openRetry(d)}
                        className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry credit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retry Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0D1627] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Retry Credit</h3>
                <p className="text-xs text-gray-400 mt-0.5">For {modal.deposit.users?.full_name}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Mode tabs */}
              <div className="flex rounded-lg bg-gray-100 dark:bg-white/5 p-1 gap-1">
                {(['chain', 'manual'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setModal(md => md ? { ...md, mode: m } : md)}
                    className={clsx(
                      'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                      modal.mode === m
                        ? 'bg-white dark:bg-[#1A2744] text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    )}
                  >
                    {m === 'chain' ? 'On-chain lookup' : 'Manual override'}
                  </button>
                ))}
              </div>

              {modal.mode === 'chain' ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Actual on-chain transaction hash
                  </label>
                  <input
                    value={modal.txHash}
                    onChange={e => setModal(md => md ? { ...md, txHash: e.target.value } : md)}
                    placeholder="0x..."
                    className="input text-sm font-mono"
                  />
                  <p className="text-[11px] text-gray-400">
                    The backend will fetch the receipt, parse the PaymentReceived event, compute the USD value, and credit the user.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    USD amount to credit
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      value={modal.amountUsd}
                      onChange={e => setModal(md => md ? { ...md, amountUsd: e.target.value } : md)}
                      placeholder="0.00"
                      type="number"
                      min="0"
                      step="0.01"
                      className="input text-sm pl-6"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Use when ETH_RPC_URL is unavailable or the price was $0 at confirmation time. Still uses the atomic credit guard — no double-credits possible.
                  </p>
                </div>
              )}

              {/* Payment ID info */}
              {modal.deposit.tx_hash && (
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3">
                  <p className="text-[11px] text-gray-400 mb-1">Payment ID stored on this record:</p>
                  <code className="text-[11px] font-mono text-gray-600 dark:text-gray-300 break-all">{modal.deposit.tx_hash}</code>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setModal(null)} className="btn-secondary flex-1 text-sm" disabled={retrying}>
                  Cancel
                </button>
                <button onClick={submitRetry} className="btn-primary flex-1 text-sm" disabled={retrying}>
                  {retrying ? 'Processing…' : 'Credit user'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
