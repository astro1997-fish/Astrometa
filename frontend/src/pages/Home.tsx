import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Shield, Users, BarChart3, Globe,
  TrendingUp, ChevronRight, Star, CheckCircle2
} from 'lucide-react'
import ParticleBackground from '@/components/ui/ParticleBackground'
import { StatCard, SectionHeader } from '@/components/ui/index'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' }
  }),
}

const FEATURES = [
  { icon: Shield,    titleKey: 'features.security',      descKey: 'features.securityDesc',      color: 'text-blue-400'   },
  { icon: Users,     titleKey: 'features.experts',       descKey: 'features.expertsDesc',       color: 'text-violet-400' },
  { icon: BarChart3, titleKey: 'features.transparent',   descKey: 'features.transparentDesc',   color: 'text-emerald-400' },
  { icon: Globe,     titleKey: 'features.multicurrency', descKey: 'features.multicurrencyDesc', color: 'text-amber-400'  },
]

const STEPS = [
  { num: '01', titleKey: 'howItWorks.step1Title', descKey: 'howItWorks.step1Desc' },
  { num: '02', titleKey: 'howItWorks.step2Title', descKey: 'howItWorks.step2Desc' },
  { num: '03', titleKey: 'howItWorks.step3Title', descKey: 'howItWorks.step3Desc' },
]

const TESTIMONIALS = [
  {
    name: 'James Okafor',
    location: 'Lagos, Nigeria',
    avatar: 'JO',
    rating: 5,
    text: 'ASTRO META-TRADE transformed how I think about wealth. My Silver portfolio has grown 23% in 8 months. The manager communicates weekly and the dashboard is crystal-clear.',
  },
  {
    name: 'Marie Dupont',
    location: 'Paris, France',
    avatar: 'MD',
    rating: 5,
    text: 'I was skeptical at first, but the Gold package delivered exactly what they promised. Professional team, transparent reporting, and my withdrawal was processed in under 24 hours.',
  },
  {
    name: 'David Chen',
    location: 'Singapore',
    avatar: 'DC',
    rating: 5,
    text: 'The Platinum desk is exceptional. My dedicated trading team sends daily briefings and the custom portfolio strategy has outperformed everything I had with traditional wealth managers.',
  },
]

const TRUST_BADGES = [
  'SSL 256-bit Encryption',
  'Cold Storage Security',
  'GDPR Compliant',
  'Multi-Sig Wallets',
  '24/7 Monitoring',
]

export default function Home() {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center bg-white dark:bg-[#070D1F] pt-[var(--nav-h)]">
        {/* Grid background */}
        <div className="absolute inset-0 grid-bg opacity-60 dark:opacity-100" />
        <ParticleBackground />

        {/* Gradient blobs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-violet-400/10 rounded-full blur-3xl" />

        <div className="relative z-content max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 dark:bg-brand-400/10 border border-brand-200 dark:border-brand-400/20 text-brand-600 dark:text-brand-400 text-xs font-semibold uppercase tracking-widest mb-6">
                <TrendingUp className="w-3 h-3" />
                {t('hero.eyebrow')}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight text-gray-900 dark:text-white mb-6"
            >
              {t('hero.title')}<br />
              <span className="text-gradient">{t('hero.titleAccent')}</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
              <Link to="/register" className="btn-primary text-base px-8 py-4 shadow-glow-blue">
                {t('hero.cta1')}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/packages" className="btn-secondary text-base px-8 py-4">
                {t('hero.cta2')}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              variants={fadeUp}
              className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto p-6 glass dark:glass-dark rounded-2xl"
            >
              <StatCard value={2.4}  prefix="$" suffix="B+" decimals={1} label={t('hero.stat1Label')} />
              <StatCard value={48000} suffix="+"              label={t('hero.stat2Label')} />
              <StatCard value={120}   suffix="+"              label={t('hero.stat3Label')} />
              <StatCard value={7}     suffix="+"              label={t('hero.stat4Label')} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <section className="py-24 bg-gray-50 dark:bg-[#0A1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('features.eyebrow')}
            title={t('features.title')}
            center
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.titleKey}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                whileHover={{ y: -4 }}
                className="card hover:border-brand-400/20 hover:shadow-glow-blue"
              >
                <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t(f.titleKey)}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t(f.descKey)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section className="py-24 bg-white dark:bg-[#070D1F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('howItWorks.eyebrow')}
            title={t('howItWorks.title')}
            center
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-10 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />

            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <div className="w-20 h-20 rounded-2xl bg-gradient-brand flex items-center justify-center text-white text-2xl font-black mx-auto mb-5 shadow-glow-blue">
                  {step.num}
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{t(step.titleKey)}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t(step.descKey)}</p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/how-it-works" className="btn-secondary">
              Learn the full process <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Packages teaser ───────────────────────────────────────── */}
      <section className="py-24 bg-gray-50 dark:bg-[#0A1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <SectionHeader
            eyebrow={t('packages.eyebrow')}
            title={t('packages.title')}
            subtitle={t('packages.subtitle')}
            center
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              { name: 'Silver', min: '$5,000', ret: '15–30%', icon: '🥈', glow: 'hover:ring-glow-blue' },
              { name: 'Gold',   min: '$18,000', ret: '25–50%', icon: '🥇', glow: 'hover:ring-glow-gold', popular: true },
              { name: 'Platinum', min: '$35,000', ret: 'Custom', icon: '💎', glow: 'hover:ring-glow-violet' },
            ].map((pkg, i) => (
              <motion.div
                key={pkg.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.02 }}
                className={`card relative cursor-pointer transition-all ${pkg.glow}`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="badge-blue text-[11px] px-3 py-1 font-semibold">Most Popular</span>
                  </div>
                )}
                <div className="text-4xl mb-3">{pkg.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{pkg.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">From {pkg.min}</p>
                <p className="text-2xl font-bold text-gradient mb-4">{pkg.ret}<span className="text-sm font-normal text-gray-400 dark:text-gray-400"> /yr</span></p>
                <Link to="/packages" className="btn-primary w-full justify-center text-sm">
                  {t('packages.investNow')}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust badges ──────────────────────────────────────────── */}
      <section className="py-12 bg-white dark:bg-[#070D1F] border-y border-gray-100 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-8">
            {TRUST_BADGES.map(badge => (
              <div key={badge} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {badge}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────── */}
      <section className="py-24 bg-gray-50 dark:bg-[#0A1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow={t('testimonials.eyebrow')}
            title={t('testimonials.title')}
            center
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
                  "{t.text}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-400">{t.location}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-brand relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
            Ready to grow your crypto wealth?
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Join over 48,000 investors who trust ASTRO META-TRADE with their digital asset portfolio.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-brand-600 font-bold text-base hover:bg-blue-50 transition-all duration-200 shadow-lg">
              Start Investing Today <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/support" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-white/30 text-white font-semibold text-base hover:bg-white/10 transition-all duration-200">
              Talk to an Advisor
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
