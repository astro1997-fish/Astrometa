import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Rocket, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'
import { COUNTRIES } from '@/lib/countries'

// ── Field must live outside Register so React sees a stable component
// reference across renders. Defining it inside caused focus loss after
// every keystroke (React unmounted + remounted the input each render).
interface FieldProps {
  name: string
  label: string
  type?: string
  value: string
  placeholder?: string
  error?: string
  onChange: (name: string, value: string) => void
  children?: React.ReactNode
}

function Field({ name, label, type = 'text', value, placeholder, error, onChange, children }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        className={`input ${error ? 'border-red-400 focus:ring-red-400/40' : ''}`}
        required
      />
      {children}
      {error && (
        <p className="flex items-center gap-1 text-red-500 text-xs mt-1">
          <AlertCircle className="w-3 h-3" />{error}
        </p>
      )}
    </div>
  )
}

export default function Register() {
  const { t } = useTranslation()
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '', country: '', terms: false
  })
  const [showPw, setShowPw]               = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading]             = useState(false)
  const [errors, setErrors]               = useState<Record<string, string>>({})

  const set = (key: string, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.fullName.trim())          e.fullName = t('errors.required')
    if (!form.email)                    e.email    = t('errors.required')
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = t('errors.invalidEmail')
    if (!form.password)                 e.password = t('errors.required')
    else if (form.password.length < 8)  e.password = t('errors.passwordTooShort')
    if (form.password !== form.confirmPassword) e.confirmPassword = t('errors.passwordMismatch')
    if (!form.country)                  e.country = t('errors.required')
    if (!form.terms)                    e.terms   = 'You must accept the terms to continue.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await signUp(form.email, form.password, form.fullName, form.country)
      toast.success('Account created! Please verify your email.')
      navigate('/verify-email')
    } catch (err: any) {
      setErrors({ form: err.message ?? t('errors.generic') })
    } finally {
      setLoading(false)
    }
  }

  // Password strength
  const pwStrength = (() => {
    const pw = form.password
    if (!pw) return 0
    let s = 0
    if (pw.length >= 8) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return s
  })()
  const pwColors = ['', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-400']
  const pwLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070D1F] flex items-center justify-center p-4 py-12">
      <div className="absolute inset-0 grid-bg opacity-40 dark:opacity-60" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="bg-white dark:bg-[#0D1627] rounded-2xl border border-gray-100 dark:border-white/10 shadow-card-dark p-8">
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow-blue">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">
              ASTRO <span className="text-gradient">META-TRADE</span>
            </span>
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-1">
            {t('auth.registerTitle')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
            {t('auth.registerSubtitle')}
          </p>

          {errors.form && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm mb-5">
              <AlertCircle className="w-4 h-4 shrink-0" />{errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              name="fullName"
              label={t('auth.fullName')}
              value={form.fullName}
              placeholder="John Doe"
              error={errors.fullName}
              onChange={set}
            />
            <Field
              name="email"
              label={t('auth.email')}
              type="email"
              value={form.email}
              placeholder="you@example.com"
              error={errors.email}
              onChange={set}
            />

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  className={`input pr-10 ${errors.password ? 'border-red-400' : ''}`}
                  placeholder="Min. 8 characters"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1 flex-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pwStrength ? pwColors[pwStrength] : 'bg-gray-200 dark:bg-white/10'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-400">{pwLabels[pwStrength]}</span>
                </div>
              )}
              {errors.password && <p className="flex items-center gap-1 text-red-500 text-xs mt-1"><AlertCircle className="w-3 h-3" />{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('auth.confirmPassword')}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                  className={`input pr-10 ${errors.confirmPassword ? 'border-red-400' : ''}`}
                  placeholder="Repeat password"
                />
                <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:hover:text-gray-200">
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {form.confirmPassword && form.password === form.confirmPassword && (
                  <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
              {errors.confirmPassword && <p className="flex items-center gap-1 text-red-500 text-xs mt-1"><AlertCircle className="w-3 h-3" />{errors.confirmPassword}</p>}
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('auth.country')}
              </label>
              <select
                value={form.country}
                onChange={e => set('country', e.target.value)}
                className={`input ${errors.country ? 'border-red-400' : ''}`}
                required
              >
                <option value="">Select country...</option>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              {errors.country && <p className="flex items-center gap-1 text-red-500 text-xs mt-1"><AlertCircle className="w-3 h-3" />{errors.country}</p>}
            </div>

            {/* Terms */}
            <div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.terms}
                  onChange={e => set('terms', e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-brand-500 focus:ring-brand-400"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('auth.terms')}{' '}
                  <Link to="/terms" className="text-brand-400 hover:underline">{t('auth.termsLink')}</Link>
                  {' '}{t('auth.andText')}{' '}
                  <Link to="/privacy" className="text-brand-400 hover:underline">{t('auth.privacyLink')}</Link>
                </span>
              </label>
              {errors.terms && <p className="flex items-center gap-1 text-red-500 text-xs mt-1"><AlertCircle className="w-3 h-3" />{errors.terms}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating account...
                </span>
              ) : t('auth.signUp')}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-brand-400 font-medium hover:underline">{t('auth.signIn')}</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
