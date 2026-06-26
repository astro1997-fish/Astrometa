import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Wallet,
  ArrowUpCircle, Settings, MessageSquare, Menu, X,
  Rocket, LogOut, Bell
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
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
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
              {profile?.full_name ?? 'Investor'}
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

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/60 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-[#0D1627] border-r border-gray-100 dark:border-white/10 z-50 flex flex-col"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white dark:bg-[#0D1627] border-b border-gray-100 dark:border-white/10 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden btn-ghost w-9 h-9 p-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-2">
            <button className="btn-ghost w-9 h-9 p-0 relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-400" />
            </button>
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
