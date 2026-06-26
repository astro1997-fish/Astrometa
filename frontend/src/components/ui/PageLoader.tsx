// PageLoader.tsx
import { motion } from 'framer-motion'
import { Rocket } from 'lucide-react'

export default function PageLoader() {
  return (
    <div className="fixed inset-0 bg-white dark:bg-[#070D1F] flex items-center justify-center z-[100]">
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow-blue">
          <Rocket className="w-7 h-7 text-white" />
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-brand-400"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}
