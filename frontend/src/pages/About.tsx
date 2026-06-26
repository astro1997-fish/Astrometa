// About.tsx
import { motion } from 'framer-motion'
import { Target, Eye, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="pt-[var(--nav-h)] min-h-screen bg-white dark:bg-[#070D1F]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto">
          <span className="section-eyebrow">About ASTRO META-TRADE</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mt-3 mb-5 leading-tight">
            Democratising access to <span className="text-gradient">professional crypto investment</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed">
            Founded in 2018 by a team of quantitative traders, blockchain engineers, and wealth management veterans, 
            ASTRO META-TRADE was built on a simple premise: the sophisticated strategies used by hedge funds and 
            institutional desks should be available to every serious investor, not just the ultra-wealthy.
          </p>
        </div>

        {/* Mission cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Target, title: 'Our Mission',  color: 'text-brand-400',   desc: 'To bridge the gap between institutional-grade crypto trading and the individual investor. We believe that expert management, transparent reporting, and disciplined risk controls should be accessible at every capital level.' },
            { icon: Eye,    title: 'Our Vision',   color: 'text-violet-400',  desc: 'A world where every individual — regardless of geography or net worth — can participate meaningfully in the digital asset economy, backed by the same quality of professional management once reserved for the elite.' },
            { icon: Heart,  title: 'Our Values',   color: 'text-emerald-400', desc: 'Transparency above all. Radical honesty about performance, risk, and fees. Client capital is treated as sacred. Every decision we make is measured against a single question: is this truly in our client\'s best interest?' },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card">
              <div className={`w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-4 ${c.color}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">{c.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <div className="bg-gradient-brand rounded-3xl p-10 text-white text-center">
          <h2 className="text-2xl font-bold mb-8">Our Track Record</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { v: '$2.4B+', l: 'Assets Under Management' },
              { v: '48,000+', l: 'Active Investors Worldwide' },
              { v: '120+', l: 'Countries Served' },
              { v: '7 Years', l: 'Proven Performance' },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-3xl font-black">{s.v}</p>
                <p className="text-blue-100 text-sm mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Link to="/register" className="btn-primary text-base px-8 py-4">Start Investing</Link>
        </div>
      </div>
    </div>
  )
}
