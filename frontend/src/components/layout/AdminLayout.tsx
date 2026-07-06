import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard, Users, Briefcase, ArrowUpCircle,
  Wallet, FileText, Rocket, LogOut, Shield, AlertCircle
} from 'lucide-react'
import { clsx } from 'clsx'

const NAV = [
  { to: '/admin',              icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users',        icon: Users,           label: 'Users' },
  { to: '/admin/portfolio',    icon: Briefcase,       label: 'Portfolios' },
  { to: '/admin/withdrawals',  icon: ArrowUpCircle,   label: 'Withdrawals' },
  { to: '/admin/addresses',    icon: Wallet,          label: 'Deposit Addresses' },
  { to: '/admin/audit',        icon: FileText,        label: 'Audit Logs' },
  { to: '/admin/deposits',     icon: AlertCircle,     label: 'Stuck Deposits' },
]

export default function AdminLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#070D1F] overflow-hidden">
      <aside className="w-56 shrink-0 bg-white dark:bg-[#0D1627] border-r border-gray-100 dark:border-white/10 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Rocket className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-gray-900 dark:text-white">Admin Panel</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <Shield className="w-3 h-3 text-brand-400" />
            <span className="text-xs text-brand-400 font-medium">Super Admin</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => clsx('sidebar-link', isActive && 'sidebar-link-active')}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-100 dark:border-white/10">
          <button
            onClick={async () => { await signOut(); navigate('/') }}
            className="sidebar-link w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
