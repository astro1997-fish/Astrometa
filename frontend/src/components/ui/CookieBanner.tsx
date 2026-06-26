import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Cookie } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CookieBanner() {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('astro-cookie-consent')
    if (!consent) {
      const timer = setTimeout(() => setShow(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const accept  = () => { localStorage.setItem('astro-cookie-consent', 'accepted');  setShow(false) }
  const decline = () => { localStorage.setItem('astro-cookie-consent', 'declined'); setShow(false) }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50"
        >
          <div className="glass dark:glass-dark rounded-2xl p-4 shadow-card-dark">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-400/10 flex items-center justify-center shrink-0">
                <Cookie className="w-4 h-4 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {t('cookie.message')}{' '}
                  <Link to="/privacy" className="text-brand-400 hover:underline">{t('cookie.learnMore')}</Link>
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={accept} className="btn-primary py-1.5 px-4 text-xs">
                    {t('cookie.accept')}
                  </button>
                  <button onClick={decline} className="btn-ghost py-1.5 px-4 text-xs">
                    {t('cookie.decline')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
