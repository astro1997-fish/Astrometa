import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Copy, Check, AlertTriangle, ChevronRight, CreditCard, Bitcoin } from 'lucide-react'
import QRCode from 'react-qr-code'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import axios from 'axios'

type FundMethod = 'crypto' | 'fiat'
type CryptoOption = 'btc' | 'eth' | 'usdc' | 'usdt'
type UsdtChain    = 'erc20' | 'trc20' | 'bep20'
type FiatProvider = 'stripe' | 'paystack' | 'paypal'

const COINS: { id: CryptoOption; label: string; icon: string; minDeposit: string }[] = [
  { id: 'btc',  label: 'Bitcoin',  icon: '₿',  minDeposit: '0.001 BTC'  },
  { id: 'eth',  label: 'Ethereum', icon: 'Ξ',  minDeposit: '0.01 ETH'   },
  { id: 'usdc', label: 'USDC',     icon: '◎',  minDeposit: '100 USDC'   },
  { id: 'usdt', label: 'USDT',     icon: '₮',  minDeposit: '100 USDT'   },
]

const USDT_CHAINS: { id: UsdtChain; label: string }[] = [
  { id: 'erc20', label: 'ERC-20 (Ethereum)' },
  { id: 'trc20', label: 'TRC-20 (Tron)'     },
  { id: 'bep20', label: 'BEP-20 (BSC)'      },
]

const FIAT_PROVIDERS: { id: FiatProvider; label: string; logo: string }[] = [
  { id: 'stripe',   label: 'Card (Stripe)',  logo: '💳' },
  { id: 'paystack', label: 'Paystack',       logo: '🟢' },
  { id: 'paypal',   label: 'PayPal',         logo: '🅿️' },
]

export default function FundAccount() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const location  = useLocation()
  const prefilled = (location.state as any)

  const [method,       setMethod]       = useState<FundMethod>('crypto')
  const [coin,         setCoin]         = useState<CryptoOption>('btc')
  const [usdtChain,    setUsdtChain]    = useState<UsdtChain>('erc20')
  const [fiatProvider, setFiatProvider] = useState<FiatProvider>('stripe')
  const [fiatAmount,   setFiatAmount]   = useState(prefilled?.amount ? String(prefilled.amount) : '')
  const [address,      setAddress]      = useState<string | null>(null)
  const [loadingAddr,  setLoadingAddr]  = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [confirmed,    setConfirmed]    = useState(false)
  const [fiatLoading,  setFiatLoading]  = useState(false)

  // Fetch deposit address when coin/chain changes
  useEffect(() => {
    setAddress(null)
    setConfirmed(false)
    if (method !== 'crypto') return
    setLoadingAddr(true)

    const chain = coin === 'usdt' ? usdtChain : coin
    supabase
      .from('deposit_addresses')
      .select('address')
      .eq('coin', coin)
      .eq('chain', chain)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        setAddress(data?.address ?? null)
        setLoadingAddr(false)
      })
  }, [coin, usdtChain, method])

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleConfirmSent = async () => {
    if (!user) return
    await supabase.from('transactions').insert({
      user_id:    user.id,
      type:       'deposit',
      amount_usd: 0, // Will be updated by backend on confirmation
      method:     coin,
      status:     'pending',
      tx_hash:    null,
    })
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action:  'deposit_intent',
      metadata: JSON.stringify({ coin, chain: coin === 'usdt' ? usdtChain : coin }),
    })
    setConfirmed(true)
    toast.success("Payment noted! We'll credit your balance once confirmed.")
  }

  const handleFiatPay = async () => {
    if (!fiatAmount || parseFloat(fiatAmount) < 100) {
      toast.error('Minimum deposit is $100')
      return
    }
    setFiatLoading(true)
    try {
      const { data } = await axios.post('/api/payments/create-session', {
        provider: fiatProvider,
        amount:   parseFloat(fiatAmount),
        userId:   user?.id,
        packageType: prefilled?.package,
      })
      if (data.url) window.location.href = data.url
    } catch {
      toast.error('Failed to start payment. Please try again.')
    } finally {
      setFiatLoading(false)
    }
  }

  const currentCoin = COINS.find(c => c.id === coin)!

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('fund.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('fund.subtitle')}</p>
      </div>

      {prefilled?.package && (
        <div className="flex items-center gap-2 bg-brand-50 dark:bg-brand-400/10 border border-brand-200 dark:border-brand-400/20 text-brand-600 dark:text-brand-400 rounded-xl px-4 py-3 text-sm">
          <ChevronRight className="w-4 h-4" />
          Funding for <strong className="capitalize">{prefilled.package}</strong> package
          {prefilled.amount && ` — $${parseFloat(prefilled.amount).toLocaleString()}`}
        </div>
      )}

      {/* Method toggle */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { id: 'crypto' as const, label: t('fund.crypto'), icon: Bitcoin },
          { id: 'fiat'   as const, label: t('fund.fiat'),   icon: CreditCard },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMethod(id)}
            className={clsx(
              'flex items-center justify-center gap-2 py-4 rounded-xl border-2 font-semibold text-sm transition-all',
              method === id
                ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-brand-200'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {method === 'crypto' ? (
          <motion.div key="crypto" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            {/* Coin selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fund.selectCoin')}</label>
              <div className="grid grid-cols-4 gap-2">
                {COINS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCoin(c.id)}
                    className={clsx(
                      'flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all',
                      coin === c.id
                        ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                        : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-brand-200'
                    )}
                  >
                    <span className="text-xl">{c.icon}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* USDT chain selector */}
            {coin === 'usdt' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fund.selectChain')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {USDT_CHAINS.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => setUsdtChain(ch.id)}
                      className={clsx(
                        'py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                        usdtChain === ch.id
                          ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                          : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400'
                      )}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Address display */}
            <div className="card space-y-4">
              <div className="flex items-start gap-4">
                {/* QR code */}
                <div className="shrink-0 p-3 bg-white rounded-xl border border-gray-100 dark:border-white/10">
                  {address ? (
                    <QRCode value={address} size={100} />
                  ) : (
                    <div className="w-[100px] h-[100px] skeleton rounded" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {currentCoin.label} Deposit Address
                      {coin === 'usdt' && ` (${USDT_CHAINS.find(c => c.id === usdtChain)?.label})`}
                    </label>
                    {loadingAddr ? (
                      <div className="skeleton h-9 rounded-lg" />
                    ) : address ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 font-mono truncate text-gray-700 dark:text-gray-300">
                          {address}
                        </code>
                        <button
                          onClick={copyAddress}
                          className="btn-ghost w-9 h-9 p-0 shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                        {t('fund.addressComingSoon')}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                    <p>📌 {t('fund.minDeposit')}: <strong>{currentCoin.minDeposit}</strong></p>
                    <p>⚠️ {t('fund.networkFee')} <strong>{currentCoin.label}</strong> to this address only.</p>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Send only <strong>{currentCoin.label}</strong> to this address. Sending any other asset may result in permanent loss.
                  Your balance will be credited after <strong>1–3 network confirmations</strong>.
                </p>
              </div>

              {/* Confirm button */}
              {confirmed ? (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <Check className="w-4 h-4" />
                  Thank you! Our team will verify your transaction and credit your balance shortly.
                </div>
              ) : (
                <button onClick={handleConfirmSent} className="btn-primary w-full justify-center">
                  {t('fund.confirmSent')}
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="fiat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
            {/* Provider selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('fund.selectProvider')}</label>
              <div className="grid grid-cols-3 gap-3">
                {FIAT_PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setFiatProvider(p.id)}
                    className={clsx(
                      'flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-xs font-semibold transition-all',
                      fiatProvider === p.id
                        ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                        : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400'
                    )}
                  >
                    <span className="text-2xl">{p.logo}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('fund.amount')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  value={fiatAmount}
                  onChange={e => setFiatAmount(e.target.value)}
                  placeholder="100.00"
                  min={100}
                  className="input pl-7"
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">{t('fund.minAmount')}</p>
            </div>

            <button
              onClick={handleFiatPay}
              disabled={fiatLoading}
              className="btn-primary w-full justify-center py-3"
            >
              {fiatLoading ? 'Redirecting...' : `Pay with ${FIAT_PROVIDERS.find(p => p.id === fiatProvider)?.label}`}
              <ChevronRight className="w-4 h-4" />
            </button>

            <p className="text-xs text-center text-gray-400 dark:text-gray-400">
              You'll be redirected to the payment provider. After completion, your balance will be credited automatically.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
