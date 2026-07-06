import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import PageLoader from '@/components/ui/PageLoader'
import MainLayout from '@/components/layout/MainLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import CookieBanner from '@/components/ui/CookieBanner'

// Lazy load all pages
const Home        = lazy(() => import('@/pages/Home'))
const Markets     = lazy(() => import('@/pages/Markets'))
const Packages    = lazy(() => import('@/pages/Packages'))
const HowItWorks  = lazy(() => import('@/pages/HowItWorks'))
const About       = lazy(() => import('@/pages/About'))
const Support     = lazy(() => import('@/pages/Support'))
const Login       = lazy(() => import('@/pages/auth/Login'))
const Register    = lazy(() => import('@/pages/auth/Register'))
const ForgotPw    = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPw     = lazy(() => import('@/pages/auth/ResetPassword'))
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'))

// Dashboard pages
const Overview     = lazy(() => import('@/pages/dashboard/Overview'))
const Portfolio    = lazy(() => import('@/pages/dashboard/Portfolio'))
const Transactions = lazy(() => import('@/pages/dashboard/Transactions'))
const FundAccount  = lazy(() => import('@/pages/dashboard/FundAccount'))
const Withdraw     = lazy(() => import('@/pages/dashboard/Withdraw'))
const Settings     = lazy(() => import('@/pages/dashboard/Settings'))
const Messages     = lazy(() => import('@/pages/dashboard/Messages'))

// Admin pages
const AdminDash       = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers      = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminPortfolio  = lazy(() => import('@/pages/admin/AdminPortfolio'))
const AdminWithdrawals = lazy(() => import('@/pages/admin/AdminWithdrawals'))
const AdminAddresses  = lazy(() => import('@/pages/admin/AdminAddresses'))
const AdminAuditLogs  = lazy(() => import('@/pages/admin/AdminAuditLogs'))
const AdminDeposits   = lazy(() => import('@/pages/admin/AdminDeposits'))

// Legal pages
const Terms   = lazy(() => import('@/pages/legal/Terms'))
const Privacy = lazy(() => import('@/pages/legal/Privacy'))
const Risk    = lazy(() => import('@/pages/legal/Risk'))
const NotFound = lazy(() => import('@/pages/NotFound'))

// Route guards
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public marketing site */}
              <Route element={<MainLayout />}>
                <Route path="/"            element={<Home />} />
                <Route path="/markets"     element={<Markets />} />
                <Route path="/packages"    element={<Packages />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/about"       element={<About />} />
                <Route path="/support"     element={<Support />} />
                <Route path="/terms"       element={<Terms />} />
                <Route path="/privacy"     element={<Privacy />} />
                <Route path="/risk-disclosure" element={<Risk />} />
              </Route>

              {/* Auth pages (redirect to dashboard if already logged in) */}
              <Route path="/login"         element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/register"      element={<PublicRoute><Register /></PublicRoute>} />
              <Route path="/forgot-password" element={<PublicRoute><ForgotPw /></PublicRoute>} />
              <Route path="/reset-password"  element={<ResetPw />} />
              <Route path="/verify-email"    element={<VerifyEmail />} />

              {/* Protected dashboard */}
              <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
                <Route index                element={<Overview />} />
                <Route path="portfolio"     element={<Portfolio />} />
                <Route path="transactions"  element={<Transactions />} />
                <Route path="fund"          element={<FundAccount />} />
                <Route path="withdraw"      element={<Withdraw />} />
                <Route path="settings"      element={<Settings />} />
                <Route path="messages"      element={<Messages />} />
              </Route>

              {/* Admin panel */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index                element={<AdminDash />} />
                <Route path="users"         element={<AdminUsers />} />
                <Route path="portfolio"     element={<AdminPortfolio />} />
                <Route path="withdrawals"   element={<AdminWithdrawals />} />
                <Route path="addresses"     element={<AdminAddresses />} />
                <Route path="audit"         element={<AdminAuditLogs />} />
                <Route path="deposits"      element={<AdminDeposits />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>

          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#0D1627',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
            }}
          />
          <CookieBanner />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
