import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, Menu, X, Globe, ChevronDown, Rocket } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { LANGUAGES } from '@/i18n'
import { clsx } from 'clsx'
import i18n from '@/i18n'

const NAV_LINKS = [
  { to: '/',            key: 'nav.home' },
  { to: '/markets',     key: 'nav.markets' },
  { to: '/packages',    key: 'nav.packages' },
  { to: '/how-it-works',key: 'nav.howItWorks' },
  { to: '/about',       key: 'nav.about' },
  { to: '/support',     key: 'nav.support' },
]

export default function Navbar() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const location = useLocation()
  const [scrolled, setScrolled]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [langOpen, setLangOpen]   = useState(false)
  const [userOpen, setUserOpen]   = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu whenever the route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

  return (
    <header
      className={clsx(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/90 dark:bg-[#070D1F]/90 backdrop-blur-xl shadow-sm border-b border-gray-100 dark:border-white/10'
          : 'bg-transparent'
      )}
      style={{ height: 'var(--nav-h)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center group-hover:shadow-glow-blue transition-all duration-200">
            <Rocket className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">
            ASTRO <span className="text-gradient">META-TRADE</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                clsx('nav-link px-3 py-2 rounded-lg', isActive && 'nav-link-active')
              }
            >
              {t(link.key)}
            </NavLink>
          ))}
        </nav>

        {/* Right controls */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Language picker */}
          <div className="relative">
            <button
              onClick={() => { setLangOpen(o => !o); setUserOpen(false) }}
              className="btn-ghost gap-1.5"
            >
              <Globe className="w-4 h-4" />
              <span>{currentLang.flag} {currentLang.code.toUpperCase()}</span>
              <ChevronDown className={clsx('w-3 h-3 transition-transform', langOpen && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {langOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-44 glass dark:glass-dark rounded-xl shadow-card-dark overflow-hidden z-50"
                >
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false) }}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                        lang.code === i18n.language
                          ? 'bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                      )}
                    >
                      <span className="text-base">{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Theme toggle */}
          <button onClick={toggleTheme} className="btn-ghost w-9 h-9 p-0">
            {theme === 'dark'
              ? <Sun className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
            }
          </button>

          {/* Auth buttons */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => { setUserOpen(o => !o); setLangOpen(false) }}
                className="btn-ghost gap-2"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold">
                  {user.email?.[0].toUpperCase()}
                </div>
                <ChevronDown className={clsx('w-3 h-3 transition-transform', userOpen && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {userOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-44 glass dark:glass-dark rounded-xl shadow-card-dark overflow-hidden z-50"
                  >
                    <Link
                      to="/dashboard"
                      onClick={() => setUserOpen(false)}
                      className="block px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      {t('nav.dashboard')}
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">{t('nav.login')}</Link>
              <Link to="/register" className="btn-primary">{t('nav.register')}</Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="lg:hidden btn-ghost w-9 h-9 p-0"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden bg-white dark:bg-[#0D1627] border-t border-gray-100 dark:border-white/10 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {NAV_LINKS.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                    )
                  }
                >
                  {t(link.key)}
                </NavLink>
              ))}
              <div className="pt-3 flex items-center gap-2 border-t border-gray-100 dark:border-white/10">
                {user ? (
                  <>
                    <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="btn-primary flex-1 justify-center text-center">
                      {t('nav.dashboard')}
                    </Link>
                    <button onClick={handleSignOut} className="btn-secondary flex-1">Sign Out</button>
                  </>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-secondary flex-1 justify-center">{t('nav.login')}</Link>
                    <Link to="/register" onClick={() => setMobileOpen(false)} className="btn-primary flex-1 justify-center">{t('nav.register')}</Link>
                  </>
                )}
                <button onClick={toggleTheme} className="btn-ghost w-10 h-10 p-0 shrink-0">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
