import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Send, Clock, Mail } from 'lucide-react'
import { SectionHeader } from '@/components/ui/index'
import toast from 'react-hot-toast'
import axios from 'axios'

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21.05 3.64 2.53 10.85c-1.27.5-1.26 1.2-.23 1.52l4.76 1.48 1.84 5.6c.22.62.37.86.76.86.3 0 .43-.14.6-.3l2.6-2.5 4.9 3.6c.9.5 1.55.24 1.78-.83l3.22-15.1c.32-1.32-.5-1.9-1.71-1.54Zm-12.1 11 8.98-8.14c.4-.35-.09-.53-.62-.2L7.4 13.1l-4.6-1.43 16.5-6.36-1.44 13.5-5.05-3.73-3.86 3.56Z"/>
    </svg>
  )
}

const FAQ = [
  { q: 'What is ASTRO META-TRADE?',                  a: 'ASTRO META-TRADE is a professional crypto investment platform where experienced traders actively manage your digital asset portfolio. You deposit funds, choose a package, and our team handles the rest.' },
  { q: 'How do I deposit funds?',                    a: 'You can deposit via cryptocurrency (BTC, ETH, USDC, USDT) or by card using Stripe, Paystack, or PayPal. All deposits are converted to a unified USD balance.' },
  { q: 'What are the investment packages?',          a: 'We offer three tiers: Silver ($5,000–$17,999 min, 15–30% projected annual return), Gold ($18,000–$34,999, 25–50%), and Platinum ($35,000+, custom portfolio).' },
  { q: 'Are my returns guaranteed?',                 a: 'No. Projected returns are based on historical performance and market analysis. Crypto markets are volatile and past performance does not guarantee future results. Please read our Risk Disclosure.' },
  { q: 'How do withdrawals work?',                   a: 'Submit a withdrawal request through your dashboard. Our team reviews and processes requests within 24–48 hours. Gold and Platinum users receive priority processing.' },
  { q: 'What currencies can I withdraw in?',         a: 'Withdrawals are available in BTC, ETH, USDC, USDT, and fiat via bank transfer or PayPal, depending on your region.' },
  { q: 'Who manages my portfolio?',                  a: 'Each investor is assigned a dedicated account manager or senior trader depending on their package. You can see your manager\'s name in your dashboard.' },
  { q: 'Is there a minimum investment period?',      a: 'There is no fixed lock-up period. However, we recommend a minimum 6–12 month horizon to allow your investment strategy to play out effectively.' },
  { q: 'How do I enable two-factor authentication?', a: 'Go to Dashboard → Settings → Security → Enable 2FA. You\'ll need an authenticator app like Google Authenticator or Authy.' },
  { q: 'Is ASTRO META-TRADE regulated?',             a: 'We operate in compliance with applicable financial regulations in our jurisdictions of operation. We implement full KYC, AML procedures, and GDPR-compliant data handling.' },
  { q: 'What happens if the crypto market crashes?', a: 'Our traders use hedging strategies, stop-loss mechanisms, and portfolio diversification to limit downside exposure. Your portfolio manager will communicate proactively during volatile periods.' },
  { q: 'How do I contact my account manager?',       a: 'You can message your manager directly through the in-app message inbox in your dashboard. Platinum clients also have direct phone access.' },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 dark:border-white/5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-4 text-left gap-4"
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{q}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 pb-4 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Support() {
  const [form, setForm]     = useState({ name: '', email: '', subject: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await axios.post('/api/support/contact', form)
      setSent(true)
      toast.success('Message sent! We\'ll respond within 2 hours.')
    } catch {
      toast.error('Failed to send. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pt-[var(--nav-h)] min-h-screen bg-white dark:bg-[#070D1F]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionHeader
          eyebrow="Support"
          title="How can we help?"
          subtitle="Our team is available around the clock to answer your questions and support your investment journey."
          center
        />

        {/* Response time badge */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
            <Clock className="w-3.5 h-3.5" />
            Average response time: under 2 hours
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* FAQ */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Frequently Asked Questions</h2>
            <div className="card p-6 space-y-0">
              {FAQ.map((item, i) => <FAQItem key={i} {...item} />)}
            </div>
          </div>

          {/* Contact form */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Send Us a Message</h2>
            {sent ? (
              <div className="card text-center py-12">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-emerald-500" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Message Sent!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Our support team will get back to you within 2 hours.</p>
              </div>
            ) : (
              <div className="card space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {[
                    { label: 'Your Name', key: 'name', type: 'text', placeholder: 'John Doe' },
                    { label: 'Email',     key: 'email', type: 'email', placeholder: 'you@example.com' },
                    { label: 'Subject',   key: 'subject', type: 'text', placeholder: 'e.g. Withdrawal question' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={(form as any)[key]}
                        onChange={e => set(key, e.target.value)}
                        placeholder={placeholder}
                        className="input"
                        required
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
                    <textarea
                      value={form.message}
                      onChange={e => set('message', e.target.value)}
                      rows={5}
                      placeholder="Describe your question or issue in detail..."
                      className="input resize-none"
                      required
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                    <Send className="w-4 h-4" />
                    {loading ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            )}

            {/* Live chat widget placeholder */}
            <div className="mt-4 p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 text-center">
              <p className="text-sm text-gray-400 mb-2">Prefer live chat?</p>
              <button
                onClick={() => (window as any).Tawk_API?.toggle?.()}
                className="btn-secondary text-sm"
              >
                Open Live Chat
              </button>
            </div>

            {/* Telegram chat support */}
            <div className="mt-4 p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 text-center">
              <p className="text-sm text-gray-400 mb-2">Prefer Telegram?</p>
              <a
                href="https://t.me/astrometatrade_support"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm inline-flex items-center gap-2"
              >
                <TelegramIcon className="w-4 h-4 text-[#2AABEE]" />
                Chat on Telegram
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Tawk.to live chat */}
      {/* Replace YOUR_TAWK_ID with your Tawk.to property ID */}
      {/* <script type="text/javascript">
        var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
        (function(){ var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
        s1.async=true; s1.src='https://embed.tawk.to/YOUR_TAWK_ID/default';
        s1.charset='UTF-8'; s1.setAttribute('crossorigin','*');
        s0.parentNode.insertBefore(s1,s0); })();
      </script> */}
    </div>
  )
}
