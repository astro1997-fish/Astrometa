import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Wallet,
  ArrowUpCircle, Settings, MessageSquare, Menu,
  Rocket, LogOut, Bell, CheckCheck, Trash2, CircleDollarSign,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { Moon, Sun } from 'lucide-react'

const NAV = [
  { to: '/dashboard',              icon: LayoutDashboard, key: 'dashboard.overview' },
  { to: '/dashboard/portfolio',    icon: Briefcase,       key: 'dashboard.portfolio' },
  { to: '/dashboard/transactions', icon: ArrowLeftRight,  key: 'dashboard.transactions' },
  { to: '/dashboard/fund',         icon: Wallet,          key: 'dashboard.fund' },
  { to: '/dashboard/withdraw',     icon: ArrowUpCircle,   key: 'dashboard.withdraw' },
  { to: '/dashboard/messages',     icon: MessageSquare,   key: 'dashboard.messages' },
  { to: '/dashboard/settings',     icon: Settings,        key: 'dashboard.settings' },
]

export default function DashboardLayout() {
  const { t } = useTranslation()
  const { user, profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Safety net: always close the mobile sidebar whenever the route changes,
  // regardless of which element triggered the navigation.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Keep the closed drawer out of the tab order / accessibility tree (it
  // stays mounted for the CSS slide transition, so aria-hidden alone isn't
  // enough — `inert` also removes it from focus and screen readers).
  useEffect(() => {
    const el = drawerRef.current as (HTMLElement & { inert?: boolean }) | null
    if (!el) return
    el.inert = !sidebarOpen
  }, [sidebarOpen])

  // Close on Escape, and return focus to the menu trigger when closing.
  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sidebarOpen])

  useEffect(() => {
    if (!sidebarOpen) {
      menuButtonRef.current?.focus()
    } else {
      drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    }
  }, [sidebarOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleBellClick = () => {
    setNotifOpen(prev => {
      if (!prev) markAllRead()
      return !prev
    })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100 dark:border-white/10">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
            <Rocket className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-gray-900 dark:text-white">
            ASTRO <span className="text-gradient">META-TRADE</span>
          </span>
        </NavLink>
      </div>

      {/* User */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-sm font-bold shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {profile?.full_name ?? user?.user_metadata?.full_name ?? 'Investor'}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              clsx('sidebar-link', isActive && 'sidebar-link-active')
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {t(item.key)}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-gray-100 dark:border-white/10 space-y-0.5">
        <button onClick={toggleTheme} className="sidebar-link w-full">
          {theme === 'dark'
            ? <><Sun className="w-4 h-4" /> Light Mode</>
            : <><Moon className="w-4 h-4" /> Dark Mode</>
          }
        </button>
        <button onClick={handleSignOut} className="sidebar-link w-full text-red-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#070D1F] overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-white dark:bg-[#0D1627] border-r border-gray-100 dark:border-white/10 flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay — always mounted, driven by CSS transforms so
          it can never get stuck open if a spring/exit animation fails to
          settle (AnimatePresence only unmounts after `exit` "completes",
          which can hang indefinitely in throttled/background tabs). */}
      <div
        className={clsx(
          'lg:hidden fixed inset-0 bg-black/60 z-40 transition-opacity duration-300',
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />
      <aside
        ref={drawerRef}
        className={clsx(
          'lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-[#0D1627] border-r border-gray-100 dark:border-white/10 z-50 flex flex-col transition-transform duration-300 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!sidebarOpen}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white dark:bg-[#0D1627] border-b border-gray-100 dark:border-white/10 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <button
            ref={menuButtonRef}
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-ghost w-9 h-9 p-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-2">
            <div ref={notifRef} className="relative">
              <button
                onClick={handleBellClick}
                className="btn-ghost w-9 h-9 p-0 relative"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                {unreadCount === 0 && notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gray-300 dark:bg-white/20" />
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-11 w-80 bg-white dark:bg-[#0D1627] border border-gray-100 dark:border-white/10 rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
                      {notifications.length > 0 && (
                        <button
                          onClick={clearAll}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400 dark:text-gray-600">
                          <Bell className="w-6 h-6" />
                          <p className="text-sm">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            className={clsx(
                              'flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-white/5 last:border-0 transition-colors',
                              !n.read ? 'bg-brand-50/60 dark:bg-brand-400/5' : '',
                            )}
                          >
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                              <CircleDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Deposit confirmed
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                ${n.amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {n.coin} added to your balance
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                                {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1.5" />
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-white/10">
                        <button
                          onClick={() => { navigate('/dashboard/transactions'); setNotifOpen(false) }}
                          className="flex items-center gap-1.5 text-xs text-brand-500 dark:text-brand-400 hover:underline font-medium"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          View all transactions
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
