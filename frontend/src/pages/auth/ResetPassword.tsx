import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Rocket, AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      toast.success('Password updated successfully!')
      navigate('/login')
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070D1F] flex items-center justify-center p-4">
      <div className="absolute inset-0 grid-bg opacity-40 dark:opacity-60" />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="bg-white dark:bg-[#0D1627] rounded-2xl border border-gray-100 dark:border-white/10 shadow-card-dark p-8">
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">ASTRO <span className="text-gradient">META-TRADE</span></span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-1">Set new password</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">Choose a strong password for your account.</p>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm mb-4">
              <AlertCircle className="w-4 h-4" />{error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'New password', val: password, set: setPassword, show: showPw, toggle: () => setShowPw(v => !v) },
              { label: 'Confirm password', val: confirm, set: setConfirm, show: showPw, toggle: () => setShowPw(v => !v) },
            ].map(({ label, val, set, show, toggle }, i) => (
              <div key={i}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={val}
                    onChange={e => { set(e.target.value); setError('') }}
                    className="input pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {i === 1 && val && password === val && (
                    <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  )}
                </div>
              </div>
            ))}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
