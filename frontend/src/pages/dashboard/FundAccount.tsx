import { useState, useEffect } from 'react'

declare global {
  interface Window {
    ethereum?: any
  }
}
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Copy, Check, AlertTriangle, ChevronRight, CreditCard, Bitcoin,
  Clock, ExternalLink, Wallet, Loader2,
} from 'lucide-react'
import QRCode from 'react-qr-code'
import { useAuth } from '@/contexts/AuthContext'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { ethers } from 'ethers'
import { supabase } from '@/lib/supabase'

type FundMethod    = 'crypto' | 'fiat'
type CryptoOption  = 'eth' | 'usdt' | 'usdc' | 'btc'
type FiatProvider  = 'stripe' | 'paystack' | 'paypal'

const COINS: { id: CryptoOption; label: string; icon: string; minUsd: number }[] = [
  { id: 'eth',  label: 'Ethereum', icon: 'Ξ',  minUsd: 10 },
  { id: 'usdt', label: 'USDT',     icon: '₮',  minUsd: 10 },
  { id: 'usdc', label: 'USDC',     icon: '◎',  minUsd: 10 },
  { id: 'btc',  label: 'Bitcoin',  icon: '₿',  minUsd: 10 },
]

const FIAT_PROVIDERS: { id: FiatProvider; label: string; logo: string }[] = [
  { id: 'stripe',   label: 'Card (Stripe)',  logo: '💳' },
  { id: 'paystack', label: 'Paystack',       logo: '🟢' },
  { id: 'paypal',   label: 'PayPal',         logo: '🅿️' },
]

// Minimal ABI for the AstroPaymentReceiver contract
const CONTRACT_ABI = [
  'function depositETH(bytes32 paymentId) payable',
  'function depositToken(address token, uint256 amount, bytes32 paymentId)',
]

// ERC-20 approve ABI
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
]

const ETHERSCAN   = 'https://etherscan.io'
const MEMPOOL_URL = 'https://mempool.space'

interface DepositInfo {
  txId:            string
  paymentId:       string
  contractAddress: string | null
  btcAddress:      string | null
  coin:            CryptoOption
  amountUsd:       number
  cryptoAmount:    string | null
  tokenAddress:    string | null
  expiresAt:       string
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  return { remaining, label: `${mins}:${secs.toString().padStart(2, '0')}` }
}

export default function FundAccount() {
  const { t }                      = useTranslation()
  const { user, refreshProfile }   = useAuth()
  const location  = useLocation()
  const prefilled = (location.state as any)

  const [method,       setMethod]       = useState<FundMethod>('crypto')
  const [coin,         setCoin]         = useState<CryptoOption>('eth')
  const [amountInput,  setAmountInput]  = useState(prefilled?.amount ? String(prefilled.amount) : '')
  const [fiatProvider, setFiatProvider] = useState<FiatProvider>('stripe')
  const [fiatAmount,   setFiatAmount]   = useState(prefilled?.amount ? String(prefilled.amount) : '')
  const [fiatLoading,  setFiatLoading]  = useState(false)
  const [copied,       setCopied]       = useState<string | null>(null)

  // Which coins the backend currently supports (driven by env vars)
  const [capabilities, setCapabilities] = useState<Record<CryptoOption, boolean>>({
    eth: false, usdt: false, usdc: false, btc: false,
  })

  useEffect(() => {
    api.get('/api/payments/capabilities')
      .then(({ data }) => {
        setCapabilities(data)
        // Auto-select the first available coin
        const first = COINS.find(c => data[c.id])
        if (first) setCoin(first.id)
      })
      .catch(() => {/* non-fatal — all coins stay disabled */})
  }, [])

  const [depositInfo,    setDepositInfo]    = useState<DepositInfo | null>(null)
  const [loadingDeposit, setLoadingDeposit] = useState(false)
  const [txStep,         setTxStep]         = useState<'idle' | 'approving' | 'depositing' | 'done'>('idle')
  const [onchainTxHash,  setOnchainTxHash]  = useState<string | null>(null)
  const [depositStatus,  setDepositStatus]  = useState<'waiting' | 'confirmed'>('waiting')

  const { remaining, label: countdownLabel } = useCountdown(depositInfo?.expiresAt ?? null)

  // Reset deposit info when coin or method changes
  useEffect(() => {
    setDepositInfo(null)
    setTxStep('idle')
    setOnchainTxHash(null)
    setDepositStatus('waiting')
  }, [coin, method])

  // Real-time subscription: watch the transaction row for status → confirmed
  useEffect(() => {
    if (!depositInfo?.txId) return

    const channel = supabase
      .channel(`deposit-status-${depositInfo.txId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'transactions',
          filter: `id=eq.${depositInfo.txId}`,
        },
        (payload) => {
          const newStatus = (payload.new as any)?.status
          if (newStatus === 'confirmed') {
            setDepositStatus('confirmed')
            refreshProfile()
            toast.success('Deposit confirmed! Your balance has been updated.', { duration: 6000 })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [depositInfo?.txId])

  const createDeposit = async () => {
    const usd = parseFloat(amountInput)
    if (!usd || usd < 10) {
      toast.error('Minimum deposit is $10')
      return
    }
    setLoadingDeposit(true)
    try {
      const { data } = await api.post('/api/payments/create-crypto-deposit', {
        coin,
        amountUsd: usd,
      })
      setDepositInfo(data)
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to create deposit. Please try again.')
    } finally {
      setLoadingDeposit(false)
    }
  }

  const copyText = async (text: string, label: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    toast.success(`${label} copied!`)
    setTimeout(() => setCopied(null), 2000)
  }

  // MetaMask / wallet transaction (ETH / ERC-20 only)
  const payWithWallet = async () => {
    if (!depositInfo) return

    if (!window.ethereum) {
      toast.error('No wallet detected. Install MetaMask or use the manual send instructions below.')
      return
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum as any)
      await browserProvider.send('eth_requestAccounts', [])
      const signer   = await browserProvider.getSigner()
      const contract = new ethers.Contract(depositInfo.contractAddress!, CONTRACT_ABI, signer)

      if (depositInfo.coin === 'eth') {
        if (!depositInfo.cryptoAmount) {
          toast.error('ETH amount not available. Please try again.')
          return
        }
        setTxStep('depositing')
        const weiAmount = ethers.parseEther(depositInfo.cryptoAmount)
        const tx = await contract.depositETH(depositInfo.paymentId, { value: weiAmount })
        toast.loading('Transaction submitted — waiting for confirmation…', { id: 'tx' })
        await tx.wait()
        toast.success('Payment sent! Your balance will update shortly.', { id: 'tx' })
        setOnchainTxHash(tx.hash)
        setTxStep('done')
      } else {
        if (!depositInfo.tokenAddress || !depositInfo.cryptoAmount) {
          toast.error('Token details not available. Please try again.')
          return
        }
        const decimals       = 6
        const rawAmount      = ethers.parseUnits(depositInfo.cryptoAmount, decimals)
        const tokenContract  = new ethers.Contract(depositInfo.tokenAddress, ERC20_ABI, signer)

        setTxStep('approving')
        toast.loading('Step 1/2: Approving token spend…', { id: 'tx' })
        const approveTx = await tokenContract.approve(depositInfo.contractAddress!, rawAmount)
        await approveTx.wait()
        toast.loading('Step 2/2: Sending payment…', { id: 'tx' })

        setTxStep('depositing')
        const tx = await contract.depositToken(depositInfo.tokenAddress, rawAmount, depositInfo.paymentId)
        await tx.wait()
        toast.success('Payment sent! Your balance will update shortly.', { id: 'tx' })
        setOnchainTxHash(tx.hash)
        setTxStep('done')
      }
    } catch (err: any) {
      const msg = err.reason ?? err.message ?? 'Transaction failed'
      toast.error(msg, { id: 'tx' })
      setTxStep('idle')
    }
  }

  const handleFiatPay = async () => {
    if (!fiatAmount || parseFloat(fiatAmount) < 100) {
      toast.error('Minimum deposit is $100')
      return
    }
    setFiatLoading(true)
    try {
      const { data } = await api.post('/api/payments/create-session', {
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
  const isBtc       = coin === 'btc'

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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select asset
              </label>
              <div className="grid grid-cols-4 gap-2">
                {COINS.map(c => {
                  const active = capabilities[c.id]
                  return (
                    <button
                      key={c.id}
                      onClick={() => active && setCoin(c.id)}
                      disabled={!active}
                      title={active ? undefined : `${c.label} deposits coming soon`}
                      className={clsx(
                        'relative flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-all',
                        active && coin === c.id
                          ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                          : active
                          ? 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-brand-200'
                          : 'border-gray-100 dark:border-white/5 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-60'
                      )}
                    >
                      <span className="text-xl">{c.icon}</span>
                      {c.label}
                      {!active && (
                        <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5 leading-none">
                          Soon
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Amount input */}
            {!depositInfo && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                  <input
                    type="number"
                    value={amountInput}
                    onChange={e => setAmountInput(e.target.value)}
                    placeholder="100.00"
                    min={10}
                    className="input pl-7"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Minimum deposit: $10</p>
              </div>
            )}

            {/* Generate deposit button */}
            {!depositInfo && (
              <button
                onClick={createDeposit}
                disabled={loadingDeposit}
                className="btn-primary w-full justify-center"
              >
                {loadingDeposit ? 'Generating deposit…' : `Generate ${currentCoin.label} Deposit`}
              </button>
            )}

            {/* Deposit info card */}
            {depositInfo && (
              <div className="card space-y-5">

                {/* Header: amount + countdown */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">You send</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {depositInfo.cryptoAmount
                        ? `${depositInfo.cryptoAmount} ${depositInfo.coin.toUpperCase()}`
                        : `$${depositInfo.amountUsd}`}
                    </p>
                    {depositInfo.cryptoAmount && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">≈ ${depositInfo.amountUsd} USD</p>
                    )}
                  </div>
                  {remaining > 0 ? (
                    <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl px-3 py-2 text-sm font-mono font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      {countdownLabel}
                    </div>
                  ) : (
                    <div className="text-xs text-red-500 font-semibold">Expired</div>
                  )}
                </div>

                {/* Live deposit status indicator */}
                {depositStatus === 'confirmed' ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3"
                  >
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Deposit confirmed ✅</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-500">Your balance has been updated.</p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl px-4 py-3">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Waiting for confirmation…</p>
                      <p className="text-xs text-blue-600/70 dark:text-blue-500/70">This page will update automatically once your payment is detected.</p>
                    </div>
                  </div>
                )}

                {/* QR code + address */}
                <div className="flex items-start gap-4">
                  <div className="shrink-0 p-3 bg-white rounded-xl border border-gray-100 dark:border-white/10">
                    <QRCode
                      value={isBtc
                        ? `bitcoin:${depositInfo.btcAddress}${depositInfo.cryptoAmount ? `?amount=${depositInfo.cryptoAmount}` : ''}`
                        : depositInfo.paymentId}
                      size={100}
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    {/* BTC: show deposit address */}
                    {isBtc && depositInfo.btcAddress && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Bitcoin address
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 font-mono truncate text-gray-700 dark:text-gray-300">
                            {depositInfo.btcAddress}
                          </code>
                          <button
                            onClick={() => copyText(depositInfo.btcAddress!, 'Address', 'addr')}
                            className="btn-ghost w-9 h-9 p-0 shrink-0"
                          >
                            {copied === 'addr' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ETH/token: show payment ID */}
                    {!isBtc && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Payment ID
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 font-mono truncate text-gray-700 dark:text-gray-300">
                            {depositInfo.paymentId}
                          </code>
                          <button
                            onClick={() => copyText(depositInfo.paymentId, 'Payment ID', 'pid')}
                            className="btn-ghost w-9 h-9 p-0 shrink-0"
                          >
                            {copied === 'pid' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Amount to send
                      </label>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {depositInfo.cryptoAmount
                            ? `${depositInfo.cryptoAmount} ${depositInfo.coin.toUpperCase()}`
                            : `${depositInfo.amountUsd} USD`}
                        </p>
                        {depositInfo.cryptoAmount && (
                          <button
                            onClick={() => copyText(depositInfo.cryptoAmount!, 'Amount', 'amt')}
                            className="btn-ghost w-7 h-7 p-0 shrink-0"
                          >
                            {copied === 'amt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BTC-specific instructions */}
                {isBtc ? (
                  <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-700 dark:text-orange-400 leading-relaxed">
                      Send <strong>exactly</strong> the amount shown to the address above from your Bitcoin wallet.
                      This address is unique to your deposit — do not reuse it.
                      Your balance will be credited after <strong>3 confirmations</strong> (≈ 30 minutes).
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                      <strong>Do not send {currentCoin.label} directly to a wallet address.</strong>{' '}
                      Deposits must go through our smart contract to be credited. Use the{' '}
                      <strong>"Pay with Wallet"</strong> button below — it handles everything automatically.
                    </p>
                  </div>
                )}

                {/* Transaction status / action buttons */}
                {txStep === 'done' && onchainTxHash ? (
                  <div className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                      <Check className="w-4 h-4" />
                      Transaction submitted! Balance updates after confirmation.
                    </div>
                    <a
                      href={`${ETHERSCAN}/tx/${onchainTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                    >
                      View on Etherscan <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : remaining > 0 ? (
                  <div className="space-y-3">
                    {/* BTC: waiting notice */}
                    {isBtc ? (
                      <div className="flex items-center justify-center gap-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 shrink-0" />
                        Waiting for your Bitcoin transaction… We'll credit your balance automatically after 3 confirmations.
                      </div>
                    ) : (
                      /* ETH/ERC-20: pay with wallet */
                      <button
                        onClick={payWithWallet}
                        disabled={txStep !== 'idle'}
                        className="btn-primary w-full justify-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        {txStep === 'approving'  ? 'Step 1/2: Approving…' :
                         txStep === 'depositing' ? 'Step 2/2: Sending…' :
                         'Pay with Wallet (MetaMask)'}
                      </button>
                    )}

                    <button
                      onClick={() => { setDepositInfo(null); setTxStep('idle'); setOnchainTxHash(null) }}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-center"
                    >
                      Generate a new deposit address
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-red-500 text-center font-medium">This deposit has expired.</div>
                    <button
                      onClick={() => { setDepositInfo(null); setTxStep('idle') }}
                      className="btn-primary w-full justify-center"
                    >
                      Generate new deposit
                    </button>
                  </div>
                )}

                {/* mempool.space link for BTC (shown after address generated) */}
                {isBtc && depositInfo.btcAddress && (
                  <a
                    href={`${MEMPOOL_URL}/address/${depositInfo.btcAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    Track on mempool.space <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
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
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  value={fiatAmount}
                  onChange={e => setFiatAmount(e.target.value)}
                  placeholder="100.00"
                  min={100}
                  className="input pl-7"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('fund.minAmount')}</p>
            </div>

            <button
              onClick={handleFiatPay}
              disabled={fiatLoading}
              className="btn-primary w-full justify-center py-3"
            >
              {fiatLoading ? 'Redirecting…' : `Pay with ${FIAT_PROVIDERS.find(p => p.id === fiatProvider)?.label}`}
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
