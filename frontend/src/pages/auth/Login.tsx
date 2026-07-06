import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Rocket, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from ?? '/dashboard'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError(t('errors.required')); return }
    setLoading(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back!')
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.message ?? t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070D1F] flex items-center justify-center p-4">
      <div className="absolute inset-0 grid-bg opacity-40 dark:opacity-60" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-white dark:bg-[#0D1627] rounded-2xl border border-gray-100 dark:border-white/10 shadow-card-dark p-8">
          {/* Logo */}
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow-blue">
              <Rocket className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">
              ASTRO <span className="text-gradient">META-TRADE</span>
            </span>
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-1">
            {t('auth.loginTitle')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
            {t('auth.loginSubtitle')}
          </p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm mb-5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('auth.email')}
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('auth.password')}
                </label>
                <Link to="/forgot-password" className="text-xs text-brand-400 hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('auth.rememberMe')}</span>
            </label>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-sm">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in...
                </span>
              ) : t('auth.signIn')}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-brand-400 font-medium hover:underline">
              {t('auth.signUp')}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
