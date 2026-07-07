import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Rocket, Twitter, Linkedin, Github, Youtube } from 'lucide-react'
import { LANGUAGES } from '@/i18n'
import i18n from '@/i18n'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="bg-gray-50 dark:bg-[#050B18] border-t border-gray-100 dark:border-white/5 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
                <Rocket className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">
                ASTRO <span className="text-gradient">META-TRADE</span>
              </span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-5">
              {t('footer.tagline')}
            </p>
            <div className="flex items-center gap-3">
              {[Twitter, Linkedin, Youtube, Github].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-brand-400/10 hover:text-brand-400 transition-all duration-200"
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{t('footer.company')}</h4>
            <ul className="space-y-2.5">
              {[
                { to: '/about',       label: t('nav.about') },
                { to: '/how-it-works',label: t('nav.howItWorks') },
                { to: '/packages',    label: t('nav.packages') },
                { to: '/markets',     label: t('nav.markets') },
                { to: '/support',     label: t('nav.support') },
              ].map(item => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm text-gray-500 dark:text-gray-400 hover:text-brand-400 transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-2.5">
              {[
                { to: '/terms',            label: t('footer.terms') },
                { to: '/privacy',          label: t('footer.privacy') },
                { to: '/risk-disclosure',  label: t('footer.risk') },
              ].map(item => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm text-gray-500 dark:text-gray-400 hover:text-brand-400 transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Language selector */}
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mt-6 mb-3">Language</h4>
            <select
              value={i18n.language}
              onChange={e => i18n.changeLanguage(e.target.value)}
              className="text-sm bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-gray-200 dark:border-white/5 pt-8">
          <p className="text-xs text-gray-400 dark:text-gray-400 leading-relaxed max-w-4xl mb-4">
            {t('footer.disclaimer')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-400">{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  )
}
