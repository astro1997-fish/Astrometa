import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Shield, Users, BarChart3, Globe,
  TrendingUp, ChevronRight, Star, CheckCircle2, Mail, MessageCircle
} from 'lucide-react'
import ParticleBackground from '@/components/ui/ParticleBackground'
import { StatCard, SectionHeader } from '@/components/ui/index'
import matteoPhoto from '@/assets/managers/matteo.png'
import callumPhoto from '@/assets/managers/callum.png'
import chantalPhoto from '@/assets/managers/chantal.png'
import sarahPhoto from '@/assets/managers/sarah.png'

const PORTFOLIO_MANAGERS = [
  {
    name: 'Matteo Rossi',
    title: 'Financial and Investment Analyst',
    photo: matteoPhoto,
    details: ['Italian', 'Age 31'],
    email: '1matteorossi@gmail.com',
  },
  {
    name: 'Callum Vance',
    title: 'Financial Risk Specialist',
    photo: callumPhoto,
    details: ['British', 'Age 27'],
    email: 'callumvance68@gmail.com',
  },
  {
    name: 'Chantal Villiers',
    title: 'Financial and Investment Analyst',
    photo: chantalPhoto,
    details: ['South African', 'Age 33'],
    email: 'villerschantal@gmail.com',
  },
  {
    name: 'Sarah Barnett',
    title: 'Expert in Crypto Trading & Investment Strategy',
    photo: sarahPhoto,
    details: ['Age 39', 'United States'],
    email: '1Sarahb.com@gmail.com',
  },
]

// ── Portfolio manager card ───────────────────────────────────────────────────
function ManagerCard({ m, i }: { m: typeof PORTFOLIO_MANAGERS[number]; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.08, duration: 0.4 }}
      className="card flex flex-col items-center text-center gap-3"
    >
      <img
        src={m.photo}
        alt={m.name}
        className="w-24 h-24 rounded-full object-cover border-2 border-brand-400/30 shadow-glow-blue"
      />
      <h3 className="font-semibold text-gray-900 dark:text-white">{m.name}</h3>
      {'title' in m && m.title && (
        <p className="text-xs font-medium text-brand-500 dark:text-brand-400 -mt-2">{m.title}</p>
      )}
      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
        {m.details.map(d => <p key={d}>{d}</p>)}
      </div>
      <a
        href={`mailto:${m.email}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline mt-1 break-all"
      >
        <Mail className="w-3.5 h-3.5 shrink-0" />
        {m.email}
      </a>
    </motion.div>
  )
}

// ── Testimonial card ─────────────────────────────────────────────────────────
function TestimonialCard({ r }: { r: typeof TESTIMONIALS[number] }) {
  return (
    <div className="w-80 shrink-0 rounded-2xl bg-white dark:bg-[#0D1627] border border-gray-100 dark:border-white/10 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5">
          {Array.from({ length: r.rating }).map((_, j) => (
            <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{r.location}</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed flex-1">
        "{r.text}"
      </p>
      <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-white/8">
        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${r.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
          {r.avatar}
        </div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.name}</p>
      </div>
    </div>
  )
}

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
  // USA
  {
    name: 'Marcus Williams',
    location: 'New York, USA',
    avatar: 'MW',
    rating: 5,
    color: 'from-blue-500 to-indigo-600',
    text: 'Switched from a traditional brokerage to ASTRO META-TRADE six months ago. My Gold portfolio is up 31% and the weekly manager reports keep me fully in the loop. Best decision I\'ve made.',
  },
  {
    name: 'Ashley Carter',
    location: 'Los Angeles, USA',
    avatar: 'AC',
    rating: 5,
    color: 'from-violet-500 to-purple-600',
    text: 'I started with the Silver plan just to test the waters. Within three months the returns were so consistent I upgraded to Gold. The dashboard is incredibly intuitive.',
  },
  {
    name: 'Ryan Mitchell',
    location: 'Austin, USA',
    avatar: 'RM',
    rating: 5,
    color: 'from-sky-500 to-blue-600',
    text: 'As a tech entrepreneur I\'ve seen a lot of investment platforms. ASTRO META-TRADE stands out for its transparency — every trade is logged and the audit trail is flawless.',
  },
  {
    name: 'Brittany Johnson',
    location: 'Miami, USA',
    avatar: 'BJ',
    rating: 5,
    color: 'from-pink-500 to-rose-600',
    text: 'My financial advisor recommended I diversify into crypto. ASTRO META-TRADE made it painless. The onboarding took 10 minutes and my first return hit in week two.',
  },
  // Europe
  {
    name: 'Marie Dupont',
    location: 'Paris, France',
    avatar: 'MD',
    rating: 5,
    color: 'from-emerald-500 to-teal-600',
    text: 'The Gold package delivered exactly what they promised. Professional team, transparent reporting, and my withdrawal was processed in under 24 hours. Absolument magnifique.',
  },
  {
    name: 'Lukas Becker',
    location: 'Berlin, Germany',
    avatar: 'LB',
    rating: 5,
    color: 'from-amber-500 to-orange-600',
    text: 'Präzision und Zuverlässigkeit — exactly what I expect from a wealth platform. ASTRO META-TRADE has delivered 27% growth on my Platinum portfolio in under a year. Exceptional.',
  },
  {
    name: 'Isabella Rossi',
    location: 'Milan, Italy',
    avatar: 'IR',
    rating: 5,
    color: 'from-red-500 to-rose-600',
    text: 'I was looking for a crypto platform with real human support. My dedicated manager calls every Friday with a portfolio update. That level of service is rare. Highly recommended.',
  },
  {
    name: 'Olivia Andersen',
    location: 'Stockholm, Sweden',
    avatar: 'OA',
    rating: 5,
    color: 'from-cyan-500 to-sky-600',
    text: 'The regulatory-compliant approach gave me confidence from day one. Twelve months in, I\'m averaging 19% quarterly returns. The cold-storage security layer is a huge plus.',
  },
  {
    name: 'Carlos Mendez',
    location: 'Madrid, Spain',
    avatar: 'CM',
    rating: 5,
    color: 'from-orange-500 to-amber-600',
    text: 'Llevo un año con el plan Platinum y los resultados son impresionantes. My portfolio manager speaks fluent Spanish and the multilingual support is a real differentiator.',
  },
  // Asia
  {
    name: 'David Chen',
    location: 'Singapore',
    avatar: 'DC',
    rating: 5,
    color: 'from-indigo-500 to-violet-600',
    text: 'The Platinum desk is exceptional. My trading team sends daily briefings and the custom portfolio strategy has outperformed every traditional wealth manager I\'ve used.',
  },
  {
    name: 'Yuki Tanaka',
    location: 'Tokyo, Japan',
    avatar: 'YT',
    rating: 5,
    color: 'from-fuchsia-500 to-pink-600',
    text: 'I appreciate how ASTRO META-TRADE respects my time. Automated reports, clean UI, and zero jargon. My Silver portfolio grew 22% while I focused on my own business.',
  },
  {
    name: 'Priya Sharma',
    location: 'Mumbai, India',
    avatar: 'PS',
    rating: 5,
    color: 'from-yellow-500 to-amber-600',
    text: 'As a first-time crypto investor I was nervous. The team walked me through everything step by step. Now I manage a Gold account with confidence. The returns speak for themselves.',
  },
  {
    name: 'Ji-Woo Kim',
    location: 'Seoul, South Korea',
    avatar: 'JK',
    rating: 5,
    color: 'from-teal-500 to-emerald-600',
    text: 'I\'ve tried four crypto investment platforms. None come close to ASTRO META-TRADE\'s reporting quality and account transparency. My Platinum returns have been outstanding.',
  },
  // South America
  {
    name: 'Lucas Ferreira',
    location: 'São Paulo, Brazil',
    avatar: 'LF',
    rating: 5,
    color: 'from-green-500 to-teal-600',
    text: 'Encontrei a ASTRO META-TRADE depois de meses pesquisando. Os retornos do meu plano Gold superaram minhas expectativas. Saques rápidos, suporte excelente, recomendo muito.',
  },
  {
    name: 'Valentina Cruz',
    location: 'Buenos Aires, Argentina',
    avatar: 'VC',
    rating: 5,
    color: 'from-sky-500 to-cyan-600',
    text: 'Given Argentina\'s economic climate, I needed a reliable offshore investment. ASTRO META-TRADE has given me 25% annual returns and genuine peace of mind. Truly life-changing.',
  },
  {
    name: 'Alejandro Reyes',
    location: 'Bogotá, Colombia',
    avatar: 'AR',
    rating: 5,
    color: 'from-lime-500 to-green-600',
    text: 'The multi-currency support and instant dollar settlements are exactly what I needed. My portfolio manager responds within the hour. Service this responsive is rare in fintech.',
  },
  // Canada & Mexico
  {
    name: 'Ethan Tremblay',
    location: 'Toronto, Canada',
    avatar: 'ET',
    rating: 5,
    color: 'from-blue-500 to-sky-600',
    text: 'Canadian tax reporting requirements are complex. ASTRO META-TRADE provided clean transaction exports that made filing easy. On top of that, my Gold plan is up 28% this year.',
  },
  {
    name: 'Sofía Ramírez',
    location: 'Mexico City, Mexico',
    avatar: 'SR',
    rating: 5,
    color: 'from-purple-500 to-fuchsia-600',
    text: 'Decidí invertir en criptomonedas y no sabía por dónde empezar. ASTRO META-TRADE lo hizo sencillo. Mi administrador de cartera me guía cada semana. ¡Resultados increíbles!',
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
  const [showManagers, setShowManagers] = useState(false)
  const managersPanelRef = useRef<HTMLDivElement>(null)

  // Keep the collapsed panel out of the tab order / accessibility tree — it
  // stays mounted for the CSS collapse transition, so aria-hidden alone
  // isn't enough to stop its links from being keyboard-focusable.
  useEffect(() => {
    const el = managersPanelRef.current as (HTMLDivElement & { inert?: boolean }) | null
    if (!el) return
    el.inert = !showManagers
  }, [showManagers])

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

          <div className="text-center mt-12">
            <button
              onClick={() => setShowManagers(v => !v)}
              aria-expanded={showManagers}
              aria-controls="portfolio-managers-panel"
              className="btn-primary inline-flex items-center gap-2 mx-auto"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              {showManagers ? 'Hide portfolio managers' : 'Talk to portfolio manager'}
            </button>
          </div>

          {/* Always mounted, CSS-driven open/close — avoids relying on an
              animation-completion callback that can fail to fire and leave
              the panel stuck open. */}
          <div
            id="portfolio-managers-panel"
            ref={managersPanelRef}
            aria-hidden={!showManagers}
            className={`overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-in-out grid ${
              showManagers ? 'opacity-100 mt-10' : 'opacity-0 mt-0'
            }`}
            style={{ gridTemplateRows: showManagers ? '1fr' : '0fr' }}
          >
            <div className="min-h-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {PORTFOLIO_MANAGERS.map((m, i) => (
                <ManagerCard key={m.name} m={m} i={i} />
              ))}
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
            {[
              { name: 'Bronze', min: '$5', ret: '8–15%', icon: '🥉', glow: 'hover:ring-glow-bronze' },
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

      {/* ── Investor Stories Carousel ─────────────────────────────── */}
      <section className="py-24 bg-gray-50 dark:bg-[#0A1120] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <SectionHeader
            eyebrow={t('testimonials.eyebrow')}
            title={t('testimonials.title')}
            center
          />
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-gray-50 dark:from-[#0A1120] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-gray-50 dark:from-[#0A1120] to-transparent" />
          <div className="flex gap-5 w-max animate-marquee-left hover:[animation-play-state:paused]">
            {[...TESTIMONIALS, ...TESTIMONIALS].map((r, i) => (
              <TestimonialCard key={i} r={r} />
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
