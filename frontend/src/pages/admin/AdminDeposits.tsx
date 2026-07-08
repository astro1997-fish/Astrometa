import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, ExternalLink, X, Clock, AlertTriangle } from 'lucide-react'
import { Badge, SkeletonTable } from '@/components/ui/index'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { txExplorerUrl } from '@/lib/txLink'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}

interface EthPriceStatus {
  price:             number | null
  fetchedAt:         string | null
  ageSec:            number | null
  stale:             boolean
  staleThresholdSec: number
}

interface PendingDeposit {
  id: string
  user_id: string
  amount_usd: number
  tx_hash: string | null
  created_at: string
  method: string
  status: 'pending' | 'failed' | 'pending_price'
  failure_reason: string | null
  metadata: string | null
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
  const [deposits, setDeposits]             = useState<PendingDeposit[]>([])
  const [loading, setLoading]               = useState(true)
  const [modal, setModal]                   = useState<RetryModal | null>(null)
  const [retrying, setRetrying]             = useState(false)
  const [batchRetrying, setBatchRetrying]   = useState(false)
  const [ethPrice, setEthPrice]             = useState<EthPriceStatus | null>(null)

  useEffect(() => {
    fetch('/health')
      .then(r => r.json())
      .then(json => setEthPrice(json.ethPrice as EthPriceStatus))
      .catch(() => {/* non-critical — badge just won't show */})
  }, [])

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

  const pendingPriceDeposits = deposits.filter(d => d.status === 'pending_price')
  const stuckDeposits        = deposits.filter(d => d.status !== 'pending_price')

  const openRetry = (deposit: PendingDeposit) => {
    // pending_price deposits → manual USD override by default (price was unavailable)
    // price-related failures → manual USD override; everything else → on-chain lookup
    const isPendingPrice = deposit.status === 'pending_price'
    const reason = deposit.failure_reason?.toLowerCase() ?? ''
    const mode: 'chain' | 'manual' =
      isPendingPrice || reason.includes('price') || reason.includes('$0') ? 'manual' : 'chain'
    setModal({ deposit, txHash: '', amountUsd: '', mode })
  }

  const retryAllPendingPrice = async () => {
    setBatchRetrying(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/admin/deposits/retry-pending-price', {
        method: 'POST',
        headers,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Batch retry failed')
        return
      }
      toast.success('Retry triggered — any priced deposits will be confirmed shortly')
      // Refresh list after a moment to let the server finish processing
      setTimeout(fetchDeposits, 2000)
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setBatchRetrying(false)
    }
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
      // Remove from list
      setDeposits(ds => ds.filter(d => d.id !== deposit.id))
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stuck Deposits</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Deposits awaiting a price or manual credit after a blockchain confirmation issue
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

      {/* ── Pending-price section ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Awaiting ETH Price
            </h2>
            {pendingPriceDeposits.length > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {pendingPriceDeposits.length}
              </span>
            )}
            {pendingPriceDeposits.length > 0 && ethPrice?.stale && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                title={
                  ethPrice.ageSec != null
                    ? `ETH price feed has not updated in ${fmtDuration(ethPrice.ageSec)} — these deposits can't be auto-priced right now`
                    : "ETH price feed has never returned a price — these deposits can't be auto-priced right now"
                }
              >
                <AlertTriangle className="w-3 h-3" />
                Price feed stale
              </span>
            )}
          </div>
          {pendingPriceDeposits.length > 0 && (
            <button
              onClick={retryAllPendingPrice}
              disabled={batchRetrying}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/30 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', batchRetrying && 'animate-spin')} />
              {batchRetrying ? 'Retrying…' : 'Retry all now'}
            </button>
          )}
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            These ETH deposits were confirmed on-chain but couldn't be priced because CoinGecko was unreachable at
            that moment. The auto-retry loop runs every 5 minutes — use <strong>Retry all now</strong> to trigger
            it immediately when the outage clears, or manually credit individual deposits below.
          </p>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-4"><SkeletonTable rows={3} cols={6} /></div>
          ) : pendingPriceDeposits.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No deposits awaiting price</p>
              <p className="text-xs text-gray-400 mt-1">ETH price feed is healthy</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    {['User', 'Payment ID', 'Method', 'Price feed', 'Created', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {pendingPriceDeposits.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{d.users?.full_name}</p>
                        <p className="text-xs text-gray-400">{d.users?.email}</p>
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
                        {ethPrice?.stale ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            title={
                              ethPrice.ageSec != null
                                ? `Last live price was ${fmtDuration(ethPrice.ageSec)} ago`
                                : 'No live price has ever been fetched'
                            }
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Stale
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
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
                          Manual credit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Stuck deposits section ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Stuck / Failed Deposits
          </h2>
          {stuckDeposits.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {stuckDeposits.length}
            </span>
          )}
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
          <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            These deposits are stuck in <strong>pending</strong> or <strong>failed</strong> — usually because the
            server was down when the on-chain confirmation arrived. Use <strong>Retry credit</strong> to re-query
            the chain and credit the user. The retry is idempotent — double-credits are impossible.
          </p>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-4"><SkeletonTable rows={5} cols={7} /></div>
          ) : stuckDeposits.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No stuck deposits</p>
              <p className="text-xs text-gray-400 mt-1">All crypto deposits have been processed</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    {['User', 'Expected Amount', 'Payment ID (tx_hash)', 'Method', 'Status', 'Reason', 'Created', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {stuckDeposits.map(d => (
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
                      <td className="px-4 py-3 max-w-[220px]">
                        {d.failure_reason ? (
                          <span
                            className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug block"
                            title={d.failure_reason}
                          >
                            {d.failure_reason.length > 60
                              ? d.failure_reason.slice(0, 58) + '…'
                              : d.failure_reason}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
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
      </section>

      {/* Retry Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0D1627] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {modal.deposit.status === 'pending_price' ? 'Manual Credit' : 'Retry Credit'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">For {modal.deposit.users?.full_name}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Status/failure reason banner */}
              {modal.deposit.status === 'pending_price' ? (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 px-3 py-2.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    <span className="font-semibold">Awaiting price: </span>
                    This deposit was confirmed on-chain but the ETH/USD price was unavailable at that time.
                    Enter the USD value to credit the user manually.
                  </p>
                </div>
              ) : modal.deposit.failure_reason ? (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    <span className="font-semibold">Stuck reason: </span>{modal.deposit.failure_reason}
                  </p>
                </div>
              ) : null}

              {/* Mode tabs — hidden for pending_price (manual only) */}
              {modal.deposit.status !== 'pending_price' && (
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
              )}

              {(modal.mode === 'chain' && modal.deposit.status !== 'pending_price') ? (
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
                    {modal.deposit.status === 'pending_price'
                      ? 'Enter the USD equivalent of the ETH received. Uses the atomic credit guard — no double-credits possible.'
                      : 'Use when ETH_RPC_URL is unavailable or the price was $0 at confirmation time. Still uses the atomic credit guard — no double-credits possible.'}
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
