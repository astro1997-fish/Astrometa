import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Rocket, ArrowRight } from 'lucide-react'

export default function VerifyEmail() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070D1F] flex items-center justify-center p-4">
      <div className="absolute inset-0 grid-bg opacity-40 dark:opacity-60" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-md text-center">
        <div className="bg-white dark:bg-[#0D1627] rounded-2xl border border-gray-100 dark:border-white/10 shadow-card-dark p-10">
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">ASTRO <span className="text-gradient">META-TRADE</span></span>
          </Link>
          <div className="w-20 h-20 rounded-full bg-brand-50 dark:bg-brand-400/10 flex items-center justify-center mx-auto mb-6">
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
              <Mail className="w-10 h-10 text-brand-400" />
            </motion.div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Check your email</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-8">
            We sent a verification link to your email address. Click the link to activate your account and start investing.
          </p>
          <div className="space-y-3">
            <Link to="/login" className="btn-primary w-full justify-center">
              Continue to Login <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-gray-400">
              Didn't receive it? Check your spam folder or{' '}
              <button className="text-brand-400 hover:underline">resend the email</button>.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
