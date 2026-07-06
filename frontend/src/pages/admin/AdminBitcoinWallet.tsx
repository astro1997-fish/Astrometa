import { useState, useEffect } from 'react'
import {
  Bitcoin, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Copy, Check, Trash2, ShieldCheck, Info,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface WalletStatus {
  configured: boolean
  source:     'env' | 'db' | 'none'
  valid?:     boolean
  firstAddress?: string
  isTestnet?: boolean
}

// Lightweight format check before hitting the backend
function xpubFormatOk(raw: string): boolean {
  const trimmed = raw.trim()
  const validPrefixes = ['xpub', 'ypub', 'zpub', 'Ypub', 'Zpub', 'tpub', 'upub', 'vpub']
  return validPrefixes.some(p => trimmed.startsWith(p)) && trimmed.length >= 100
}

function isTestnetPrefix(raw: string): boolean {
  return raw.startsWith('tpub') || raw.startsWith('upub') || raw.startsWith('vpub')
}

export default function AdminBitcoinWallet() {
  const [status,       setStatus]       = useState<WalletStatus | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [xpubInput,    setXpubInput]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [removing,     setRemoving]     = useState(false)
  const [previewAddr,  setPreviewAddr]  = useState<string | null>(null)
  const [copiedAddr,   setCopiedAddr]   = useState(false)
  const [showRemove,   setShowRemove]   = useState(false)

  const loadStatus = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<WalletStatus>('/api/admin/btc-wallet')
      setStatus(data)
    } catch {
      toast.error('Failed to load Bitcoin wallet status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  // Derive a preview address via the backend as the admin types
  useEffect(() => {
    setPreviewAddr(null)
    if (!xpubFormatOk(xpubInput)) return
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.post<{ success: boolean; firstAddress: string; isTestnet: boolean }>(
          '/api/admin/btc-wallet/preview',
          { xpub: xpubInput.trim() },
        )
        if (data.firstAddress) setPreviewAddr(data.firstAddress)
      } catch { /* silent — full error shown on save */ }
    }, 600)
    return () => clearTimeout(timer)
  }, [xpubInput])

  const handleSave = async () => {
    if (!xpubFormatOk(xpubInput)) {
      toast.error('The key doesn\'t look like a valid xpub. Check for typos.')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/api/admin/btc-wallet', { xpub: xpubInput.trim() })
      toast.success('Bitcoin wallet configured! BTC deposits are now active.')
      setXpubInput('')
      await loadStatus()
      if (data.isTestnet) {
        toast('⚠️ This looks like a testnet key — users will see real Bitcoin deposit addresses pointing to a testnet wallet.', {
          duration: 8000,
          icon: '⚠️',
        })
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to save xpub')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await api.delete('/api/admin/btc-wallet')
      toast.success('Bitcoin wallet removed. BTC deposits are now disabled.')
      setShowRemove(false)
      await loadStatus()
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to remove xpub')
    } finally {
      setRemoving(false)
    }
  }

  const copyAddress = async (addr: string) => {
    await navigator.clipboard.writeText(addr)
    setCopiedAddr(true)
    toast.success('Address copied!')
    setTimeout(() => setCopiedAddr(false), 2000)
  }

  const trimmedInput = xpubInput.trim()
  const inputValid   = xpubFormatOk(trimmedInput)
  const inputTestnet = isTestnetPrefix(trimmedInput)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bitcoin className="w-6 h-6 text-orange-400" />
          Bitcoin Wallet Setup
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure the HD wallet used to generate unique deposit addresses for each user.
        </p>
      </div>

      {/* ── Current status card ─────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Current Status</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking configuration…
          </div>
        ) : status?.configured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  BTC deposits active
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Source:{' '}
                  {status.source === 'env'
                    ? 'Environment variable (BTC_XPUB secret)'
                    : 'Saved via admin panel'}
                </p>
              </div>
            </div>

            {status.isTestnet && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  <strong>Testnet key detected.</strong> This wallet will generate testnet addresses.
                  Users will see Bitcoin deposit addresses that only work on Bitcoin testnet, not mainnet.
                </span>
              </div>
            )}

            {status.firstAddress && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  First derived deposit address (m/0/0)
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 font-mono truncate text-gray-700 dark:text-gray-300">
                    {status.firstAddress}
                  </code>
                  <button
                    onClick={() => copyAddress(status.firstAddress!)}
                    className="btn-ghost w-9 h-9 p-0 shrink-0"
                    title="Copy address"
                  >
                    {copiedAddr ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Verify this matches your wallet's first external address before going live.
                </p>
              </div>
            )}

            {status.source === 'db' && (
              <div className="pt-2">
                {!showRemove ? (
                  <button
                    onClick={() => setShowRemove(true)}
                    className="text-xs text-red-500 hover:text-red-400 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove wallet configuration
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-red-500">Remove xpub and disable BTC deposits?</p>
                    <button
                      onClick={handleRemove}
                      disabled={removing}
                      className="text-xs font-semibold text-red-500 hover:text-red-400"
                    >
                      {removing ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      onClick={() => setShowRemove(false)}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Not configured
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                BTC deposits are disabled. Paste your xpub below to enable them.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Setup form ──────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {status?.configured ? 'Replace xpub' : 'Configure xpub'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Use an account-level xpub at derivation path m/84'/0'/0' for native SegWit (bech32) addresses.
            </p>
          </div>
        </div>

        {/* How to get your xpub */}
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl px-3 py-2.5 text-xs text-blue-700 dark:text-blue-400">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            In most hardware wallets (Ledger, Trezor) or Sparrow Wallet, export the
            <strong> Account xpub</strong> (also shown as "zpub" for native SegWit). Do not share your seed phrase
            or private keys — the xpub is view-only.
          </span>
        </div>

        {/* xpub textarea */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Extended public key (xpub / zpub)
          </label>
          <textarea
            value={xpubInput}
            onChange={e => setXpubInput(e.target.value)}
            placeholder="xpub6C…"
            rows={3}
            className={clsx(
              'input w-full font-mono text-xs resize-none',
              trimmedInput && !inputValid && 'border-red-400 dark:border-red-500',
              trimmedInput && inputValid  && 'border-emerald-400 dark:border-emerald-500',
            )}
          />
          {trimmedInput && !inputValid && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              Doesn't look like a valid xpub. Check for missing characters or extra spaces.
            </p>
          )}
          {trimmedInput && inputValid && inputTestnet && (
            <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              This looks like a <strong>testnet</strong> key (starts with {trimmedInput.slice(0, 4)}).
              Only use this for testing — not for real funds.
            </p>
          )}
          {trimmedInput && inputValid && !inputTestnet && (
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Format looks good.
            </p>
          )}
        </div>

        {/* Live address preview */}
        {previewAddr && (
          <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              First derived address (confirm this matches your wallet)
            </p>
            <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
              {previewAddr}
            </code>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !inputValid}
          className="btn-primary w-full justify-center"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Validating &amp; saving…</>
          ) : (
            `${status?.configured ? 'Replace' : 'Save'} xpub & Enable BTC Deposits`
          )}
        </button>
      </div>

      {/* ── Security note ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
        <p>
          The xpub lets the server derive deposit addresses but <strong>cannot spend funds</strong>.
          For maximum security, set the{' '}
          <code className="font-mono bg-gray-100 dark:bg-white/10 px-1 rounded">BTC_XPUB</code>{' '}
          environment secret in your deployment settings instead — environment-injected keys
          take priority and cannot be overwritten via this UI.
        </p>
      </div>
    </div>
  )
}
