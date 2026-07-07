import { motion } from 'framer-motion'
import { UserPlus, Wallet, TrendingUp, Shield, BarChart3, Lock, RefreshCw, Globe, Repeat2 } from 'lucide-react'
import { SectionHeader } from '@/components/ui/index'
import { Link } from 'react-router-dom'

const STEPS = [
  {
    icon: UserPlus,
    num: '01',
    title: 'Register Your Account',
    desc: 'Create a free account in under two minutes. Enter your name, email, and country. Verify your email address to unlock full access to your investor dashboard.',
    color: 'from-brand-500 to-brand-400',
  },
  {
    icon: Shield,
    num: '02',
    title: 'Complete Verification',
    desc: 'Our lightweight KYC process confirms your identity. This protects you and ensures regulatory compliance. Most users are verified within minutes.',
    color: 'from-violet-500 to-violet-400',
  },
  {
    icon: Wallet,
    num: '03',
    title: 'Fund Your Portfolio',
    desc: 'Deposit using Bitcoin, Ethereum, USDC, USDT, or pay by card via Stripe, Paystack, or PayPal. All deposits convert to a unified USD balance automatically.',
    color: 'from-emerald-500 to-emerald-400',
  },
  {
    icon: BarChart3,
    num: '04',
    title: 'Choose Your Package',
    desc: 'Select from Silver, Gold, or Platinum based on your capital and risk appetite. Your dedicated account manager activates your package and begins managing your portfolio.',
    color: 'from-amber-500 to-amber-400',
  },
  {
    icon: TrendingUp,
    num: '05',
    title: 'Watch Your Portfolio Grow',
    desc: 'Log in anytime to see your real-time portfolio performance. Your manager sends weekly updates, and you can withdraw your earnings whenever you choose.',
    color: 'from-rose-500 to-rose-400',
  },
]

const FEATURES = [
  { icon: Lock,       title: 'Non-Custodial Options',      desc: 'Advanced investors can choose non-custodial paths with direct wallet integrations.', span: false },
  { icon: RefreshCw,  title: 'Auto-Rebalancing',            desc: 'Your portfolio is rebalanced automatically based on market conditions and your risk profile.', span: false },
  { icon: BarChart3,  title: 'Transparent Reporting',       desc: 'Full transaction history, performance charts, and weekly manager reports available at any time.', span: false },
  { icon: Globe,      title: 'Global Accessibility',        desc: 'Available in 120+ countries with support for 6 languages and multiple fiat currencies.', span: false },
  {
    icon: Repeat2,
    title: 'The Propagation Strategy',
    span: true,
    desc: 'Our proprietary propagation method cycles your capital across high-conviction positions. When a position hits its target yield, profits are harvested and immediately re-deployed — compounding your returns without downtime. Each cycle runs 7–21 days, fully visible on your dashboard.',
  },
]

export default function HowItWorks() {
  return (
    <div className="pt-[var(--nav-h)] min-h-screen bg-white dark:bg-[#070D1F]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionHeader
          eyebrow="The Process"
          title="From registration to returns in five steps"
          subtitle="We've made institutional crypto investment as simple as opening a savings account."
          center
        />

        <div className="space-y-6 mb-20">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: i % 2 === 0 ? -24 : 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="flex gap-5 items-start"
            >
              <div className={`shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                <step.icon className="w-6 h-6 text-white" />
              </div>
              <div className="card flex-1 flex items-start gap-4">
                <span className="text-4xl font-black text-gray-100 dark:text-white/10 leading-none shrink-0">{step.num}</span>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <SectionHeader eyebrow="Built Different" title="What sets us apart" center />
        <div className="grid grid-cols-2 gap-4 mb-12">
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className={`card ${f.span ? 'col-span-2' : ''}`}
            >
              <div className={`flex items-center gap-3 mb-3 ${f.span ? '' : 'flex-col items-start'}`}>
                <div className={`shrink-0 rounded-xl bg-brand-50 dark:bg-brand-400/10 flex items-center justify-center ${f.span ? 'w-10 h-10' : 'w-9 h-9'}`}>
                  <f.icon className={`text-brand-400 ${f.span ? 'w-5 h-5' : 'w-4 h-4'}`} />
                </div>
                <h3 className={`font-semibold text-gray-900 dark:text-white ${f.span ? 'text-base' : 'text-sm'}`}>{f.title}</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/register" className="btn-primary text-base px-8 py-4 shadow-glow-blue">
            Get Started Free
          </Link>
        </div>
      </div>
    </div>
  )
}
