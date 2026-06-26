import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Rocket, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#070D1F] flex items-center justify-center p-4">
      <div className="absolute inset-0 grid-bg opacity-40 dark:opacity-60" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center"
      >
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="text-8xl mb-6"
        >
          🚀
        </motion.div>
        <h1 className="text-8xl font-black text-gradient mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Houston, we have a problem
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
          The page you're looking for has launched into the void. Let's get you back on course.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn-primary">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <Link to="/dashboard" className="btn-secondary">
            Go to Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
