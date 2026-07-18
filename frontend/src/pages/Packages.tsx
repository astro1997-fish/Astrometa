import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, X, AlertCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { StarRating, SectionHeader } from '@/components/ui/index'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface Package {
  id: 'bronze' | 'silver' | 'gold' | 'platinum'
  icon: string
  nameKey: string
  min: number
  max: number | null
  returnRange: string
  risk: number
  features: string[]
  glow: string
  border: string
  badge?: string
  gradient: string
}

const PACKAGES: Package[] = [
  {
    id: 'bronze',
    icon: '🥉',
    nameKey: 'packages.bronzeName',
    min: 2000,
    max: 4999,
    returnRange: '8%–15%',
    risk: 2,
    features: [
      'Account Manager Access',
      'Monthly Performance Reports',
      'Email Support',
      'Portfolio Dashboard Access',
    ],
    glow: 'hover:ring-glow-bronze',
    border: 'border-orange-700/30',
    gradient: 'bg-gradient-to-br from-orange-50 to-white dark:from-orange-900/20 dark:to-[#0D1627]',
  },
  {
    id: 'silver',
    icon: '🥈',
    nameKey: 'packages.silverName',
    min: 5000,
    max: 17999,
    returnRange: '15%–30%',
    risk: 3,
    features: [
      'Dedicated Account Manager',
      'Monthly Performance Reports',
      'Portfolio Rebalancing',
      'Strategy Consultation Calls',
      'Email & Chat Support',
    ],
    glow: 'hover:ring-glow-blue',
    border: 'border-brand-400/30',
    gradient: 'bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-[#0D1627]',
  },
  {
    id: 'gold',
    icon: '🥇',
    nameKey: 'packages.goldName',
    min: 18000,
    max: 34999,
    returnRange: '25%–50%',
    risk: 4,
    features: [
      'Senior Account Manager',
      'Weekly Strategy Updates',
      'Priority Withdrawals (12h)',
      'Managed Trading Access',
      'Market Intelligence Reports',
      'Direct Manager Hotline',
    ],
    glow: 'hover:ring-glow-gold',
    border: 'border-amber-400/30',
    badge: 'packages.popular',
    gradient: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-[#0D1627]',
  },
  {
    id: 'platinum',
    icon: '💎',
    nameKey: 'packages.platinumName',
    min: 35000,
    max: null,
    returnRange: 'Custom',
    risk: 5,
    features: [
      'Private Wealth Desk',
      'Dedicated Trading Team',
      'Direct Manager Access 24/7',
      'VIP Investment Opportunities',
      'Custom Portfolio Architecture',
      'Daily Performance Briefings',
      'Tax Strategy Consultation',
    ],
    glow: 'hover:ring-glow-violet',
    border: 'border-violet-400/30',
    badge: 'packages.premium',
    gradient: 'bg-gradient-to-br from-violet-50 to-white dark:from-violet-900/20 dark:to-[#0D1627]',
  },
]

function InvestModal({
  pkg,
  onClose,
}: {
  pkg: Package
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const validate = (): boolean => {
    const num = parseFloat(amount)
    if (!amount || isNaN(num)) {
      setError(t('errors.required'))
      return false
    }
    if (num < pkg.min) {
      setError(t('packages.belowMin'))
      return false
    }
    if (pkg.max && num > pkg.max) {
      // Suggest upgrade
      if (pkg.id === 'bronze') {
        toast(t('packages.switchSilver'), { icon: '⬆️' })
      } else if (pkg.id === 'silver') {
        toast(t('packages.switchGold'), { icon: '⬆️' })
      } else if (pkg.id === 'gold') {
        toast(t('packages.switchPlatinum'), { icon: '⬆️' })
      }
      setError(t('packages.aboveMax'))
      return false
    }
    return true
  }

  const handleInvest = () => {
    if (!user) {
      navigate('/register', { state: { package: pkg.id, amount } })
      return
    }
    if (!validate()) return
    navigate('/dashboard/fund', { state: { package: pkg.id, amount: parseFloat(amount) } })
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#0D1627] rounded-2xl p-6 w-full max-w-md border border-gray-100 dark:border-white/10 shadow-card-dark"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{pkg.icon}</span>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">{t(pkg.nameKey)} Package</h3>
              <p className="text-xs text-gray-400 dark:text-gray-400">{t('packages.return')}: {pkg.returnRange} {t('packages.annually')}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 mb-5 text-sm space-y-1.5">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>{t('packages.min')}:</span>
            <span className="font-semibold text-gray-900 dark:text-white">{fmt(pkg.min)}</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>{t('packages.max')}:</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {pkg.max ? fmt(pkg.max) : t('packages.unlimited')}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Investment Amount (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400 font-medium">$</span>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError('') }}
              placeholder={`Min ${fmt(pkg.min)}`}
              className="input pl-7"
              min={pkg.min}
              max={pkg.max ?? undefined}
            />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-red-500 text-xs mt-1.5">
              <AlertCircle className="w-3 h-3" />{error}
            </p>
          )}
        </div>

        <button onClick={handleInvest} className="btn-primary w-full justify-center">
          {user ? 'Proceed to Funding' : 'Register to Invest'}
          <ArrowRight className="w-4 h-4" />
        </button>

        {!user && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-400 mt-3">
            Already have an account?{' '}
            <button onClick={() => navigate('/login', { state: { package: pkg.id } })} className="text-brand-400 hover:underline">
              Sign in
            </button>
          </p>
        )}
      </motion.div>
    </div>
  )
}

export default function Packages() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Package | null>(null)

  return (
    <div className="pt-[var(--nav-h)] min-h-screen bg-white dark:bg-[#070D1F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionHeader
          eyebrow={t('packages.eyebrow')}
          title={t('packages.title')}
          subtitle={t('packages.subtitle')}
          center
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {PACKAGES.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -6 }}
              className={clsx(
                'relative rounded-2xl border p-8 transition-all duration-300 cursor-default',
                pkg.gradient,
                pkg.border,
                pkg.glow
              )}
            >
              {pkg.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                  <span className={clsx(
                    'px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide',
                    pkg.id === 'gold'     && 'bg-amber-400 text-amber-900',
                    pkg.id === 'platinum' && 'bg-violet-500 text-white',
                  )}>
                    {t(pkg.badge)}
                  </span>
                </div>
              )}

              {/* Icon & name */}
              <div className="text-5xl mb-4">{pkg.icon}</div>
              <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">{t(pkg.nameKey)}</h3>

              {/* Return */}
              <div className="flex items-end gap-1 mb-1">
                <span className={clsx(
                  'text-4xl font-black',
                  pkg.id === 'bronze'   && 'text-gradient-bronze',
                  pkg.id === 'silver'   && 'text-gradient',
                  pkg.id === 'gold'     && 'text-gradient-gold',
                  pkg.id === 'platinum' && 'text-gradient-plat',
                )}>
                  {pkg.returnRange}
                </span>
                {pkg.id !== 'platinum' && (
                  <span className="text-gray-400 dark:text-gray-400 text-sm mb-1">{t('packages.annually')}</span>
                )}
              </div>

              {/* Risk */}
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xs text-gray-400 dark:text-gray-400">{t('packages.risk')}:</span>
                <StarRating value={pkg.risk} />
              </div>

              {/* Min / Max */}
              <div className="flex gap-4 mb-6 text-sm">
                <div>
                  <p className="text-gray-400 dark:text-gray-400 text-xs">{t('packages.min')}</p>
                  <p className="font-bold text-gray-900 dark:text-white">
                    ${pkg.min.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 dark:text-gray-400 text-xs">{t('packages.max')}</p>
                  <p className="font-bold text-gray-900 dark:text-white">
                    {pkg.max ? `$${pkg.max.toLocaleString()}` : t('packages.unlimited')}
                  </p>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-8">
                {pkg.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                    <div className={clsx(
                      'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                      pkg.id === 'bronze'   && 'bg-orange-100 dark:bg-orange-400/20 text-orange-600',
                      pkg.id === 'silver'   && 'bg-brand-100 dark:bg-brand-400/20 text-brand-500',
                      pkg.id === 'gold'     && 'bg-amber-100 dark:bg-amber-400/20 text-amber-500',
                      pkg.id === 'platinum' && 'bg-violet-100 dark:bg-violet-400/20 text-violet-500',
                    )}>
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setSelected(pkg)}
                className={clsx(
                  'w-full py-3 rounded-xl font-bold text-sm transition-all duration-200',
                  pkg.id === 'bronze'   && 'bg-gradient-bronze text-white hover:opacity-90 hover:shadow-glow-bronze',
                  pkg.id === 'silver'   && 'btn-primary',
                  pkg.id === 'gold'     && 'bg-gradient-gold text-amber-900 hover:opacity-90 hover:shadow-glow-gold',
                  pkg.id === 'platinum' && 'bg-gradient-plat text-white hover:opacity-90 hover:shadow-lg',
                )}
              >
                {t('packages.investNow')} →
              </button>
            </motion.div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-400 mt-10 max-w-2xl mx-auto">
          Our portfolio managers have a consistent track record of delivering strong results across all market conditions.
          Return projections are based on verified historical performance and actively managed strategies — your capital is
          in expert hands every step of the way.
        </p>
      </div>

      <AnimatePresence>
        {selected && (
          <InvestModal pkg={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
