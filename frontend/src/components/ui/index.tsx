import { useInView } from 'react-intersection-observer'
import CountUp from 'react-countup'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

// ── AnimatedCounter ───────────────────────────────────────────────
interface CounterProps {
  end: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  className?: string
}

export function AnimatedCounter({ end, prefix = '', suffix = '', decimals = 0, duration = 2.5, className }: CounterProps) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 })

  return (
    <span ref={ref} className={className}>
      {inView ? (
        <CountUp end={end} prefix={prefix} suffix={suffix} decimals={decimals} duration={duration} separator="," />
      ) : (
        `${prefix}0${suffix}`
      )}
    </span>
  )
}

// ── StatCard ──────────────────────────────────────────────────────
interface StatCardProps {
  value: number
  prefix?: string
  suffix?: string
  label: string
  decimals?: number
  className?: string
}

export function StatCard({ value, prefix, suffix, label, decimals, className }: StatCardProps) {
  return (
    <div className={clsx('text-center', className)}>
      <AnimatedCounter
        end={value}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white"
      />
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  )
}

// ── SkeletonCard ──────────────────────────────────────────────────
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card space-y-3 animate-pulse">
      <div className="skeleton h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={clsx('skeleton h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

// ── SkeletonTable ─────────────────────────────────────────────────
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className={clsx('skeleton h-3 rounded', c === 0 ? 'w-8 h-8 rounded-full shrink-0' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────
type BadgeVariant = 'green' | 'red' | 'blue' | 'gold' | 'violet' | 'gray'

export function Badge({ children, variant = 'blue' }: { children: ReactNode; variant?: BadgeVariant }) {
  const cls: Record<BadgeVariant, string> = {
    green:  'badge-green',
    red:    'badge-red',
    blue:   'badge-blue',
    gold:   'badge-gold',
    violet: 'badge-violet',
    gray:   'badge bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
  }
  return <span className={cls[variant]}>{children}</span>
}

// ── SectionHeader ─────────────────────────────────────────────────
export function SectionHeader({
  eyebrow, title, subtitle, center = false
}: {
  eyebrow?: string; title: string | ReactNode; subtitle?: string; center?: boolean
}) {
  return (
    <div className={clsx('mb-12', center && 'text-center')}>
      {eyebrow && <p className="section-eyebrow mb-3">{eyebrow}</p>}
      <h2 className="section-title mb-4">{title}</h2>
      {subtitle && (
        <p className="text-gray-500 dark:text-gray-400 max-w-2xl text-lg leading-relaxed mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  )
}

// ── StarRating ────────────────────────────────────────────────────
export function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            'w-2.5 h-2.5 rounded-sm',
            i < value ? 'bg-brand-400' : 'bg-gray-200 dark:bg-white/10'
          )}
        />
      ))}
    </div>
  )
}
