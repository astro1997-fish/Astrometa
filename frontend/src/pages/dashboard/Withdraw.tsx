import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

const METHODS = ['btc', 'eth', 'usdc', 'usdt', 'bank_transfer', 'paypal']

export default function Withdraw() {
  const { user } = useAuth()
  const [form, setForm]     = useState({ amount: '', method: 'btc', destination: '' })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (parseFloat(form.amount) < 50) { toast.error('Minimum withdrawal is $50'); return }
    if (!form.destination) { toast.error('Please provide a destination address or account'); return }

    setLoading(true)
    try {
      await supabase.from('withdrawals').insert({
        user_id:     user.id,
        amount_usd:  parseFloat(form.amount),
        method:      form.method,
        destination: form.destination,
        status:      'pending',
      })
      await supabase.from('audit_logs').insert({
        user_id:  user.id,
        action:   'withdrawal_request',
        metadata: JSON.stringify(form),
      })
      setSubmitted(true)
      toast.success('Withdrawal request submitted!')
    } catch {
      toast.error('Failed to submit request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Withdraw Funds</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Withdrawal requests are processed within 24–48 hours</p>
      </div>

      {submitted ? (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card text-center py-12">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Request Submitted</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Your withdrawal is pending admin approval. You'll receive a notification once processed.
          </p>
          <button onClick={() => setSubmitted(false)} className="btn-secondary mx-auto">Make another request</button>
        </motion.div>
      ) : (
        <div className="card space-y-5">
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3">
            <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Withdrawals are reviewed by our team before processing. Allow 24–48 hours for completion.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="50.00"
                  className="input pl-7"
                  min={50}
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Minimum withdrawal: $50</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Withdrawal Method</label>
              <select value={form.method} onChange={e => set('method', e.target.value)} className="input">
                {METHODS.map(m => (
                  <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Destination {['btc','eth','usdc','usdt'].includes(form.method) ? 'Wallet Address' : 'Account Details'}
              </label>
              <input
                type="text"
                value={form.destination}
                onChange={e => set('destination', e.target.value)}
                placeholder={['btc','eth','usdc','usdt'].includes(form.method) ? '0x...' : 'Account number / PayPal email'}
                className="input"
                required
              />
            </div>

            <div className="flex items-start gap-2 bg-brand-50 dark:bg-brand-400/5 border border-brand-100 dark:border-brand-400/10 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-600 dark:text-brand-400">
                Ensure your destination address/account is correct. Withdrawals to wrong addresses cannot be reversed.
              </p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Submitting...' : 'Request Withdrawal'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
