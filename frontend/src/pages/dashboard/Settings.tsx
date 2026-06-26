import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Lock, Bell, Globe, Shield, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { LANGUAGES } from '@/i18n'
import { COUNTRIES } from '@/lib/countries'
import i18n from '@/i18n'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

type Tab = 'profile' | 'security' | 'notifications' | 'language'

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'profile',       label: 'Profile',       icon: User   },
  { id: 'security',      label: 'Security',      icon: Lock   },
  { id: 'notifications', label: 'Notifications', icon: Bell   },
  { id: 'language',      label: 'Language',      icon: Globe  },
]

export default function Settings() {
  const { user, profile, refreshProfile } = useAuth()
  const [tab, setTab]     = useState<Tab>('profile')
  const [saving, setSaving] = useState(false)

  // Profile
  const [name,    setName]    = useState(profile?.full_name ?? '')
  const [country, setCountry] = useState(profile?.country ?? '')

  // Security
  const [curPw,     setCurPw]     = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw,    setShowPw]    = useState(false)

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from('users').update({ full_name: name, country }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    toast.success('Profile updated!')
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw.length < 8)      { toast.error('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw)    { toast.error('Passwords do not match'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) toast.error(error.message)
    else { toast.success('Password changed!'); setCurPw(''); setNewPw(''); setConfirmPw('') }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your account preferences</p>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-white dark:bg-[#0D1627] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="card space-y-5">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-brand-400" /> Profile Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Your full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input value={user?.email ?? ''} disabled className="input opacity-60 cursor-not-allowed" />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact support if needed.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country</label>
                <select value={country} onChange={e => setCountry(e.target.value)} className="input">
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <button onClick={saveProfile} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* Security tab */}
        {tab === 'security' && (
          <div className="space-y-4">
            <div className="card space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand-400" /> Change Password
              </h2>
              <form onSubmit={changePassword} className="space-y-4">
                {[
                  { label: 'Current Password', val: curPw, set: setCurPw },
                  { label: 'New Password',      val: newPw, set: setNewPw },
                  { label: 'Confirm New Password', val: confirmPw, set: setConfirmPw },
                ].map(({ label, val, set }, i) => (
                  <div key={i}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={val}
                        onChange={e => set(e.target.value)}
                        className="input pr-10"
                        placeholder="••••••••"
                        required
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-brand-400" /> Two-Factor Authentication
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {profile?.two_fa_enabled
                      ? '2FA is active on your account. Your account is protected.'
                      : 'Add an extra layer of security with an authenticator app.'
                    }
                  </p>
                </div>
                <button className={clsx('shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all', profile?.two_fa_enabled ? 'btn-secondary' : 'btn-primary')}>
                  {profile?.two_fa_enabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications tab */}
        {tab === 'notifications' && (
          <div className="card space-y-5">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-brand-400" /> Notification Preferences
            </h2>
            {[
              { label: 'Deposit confirmations',       desc: 'Get notified when a deposit is confirmed' },
              { label: 'Withdrawal updates',           desc: 'Get notified on withdrawal status changes' },
              { label: 'Portfolio updates',            desc: 'Receive weekly portfolio performance emails' },
              { label: 'Manager messages',             desc: 'Get notified when your manager sends a message' },
              { label: 'Promotional updates',          desc: 'New packages, features and platform news' },
            ].map((n, i) => (
              <label key={i} className="flex items-center justify-between cursor-pointer group">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{n.label}</p>
                  <p className="text-xs text-gray-400">{n.desc}</p>
                </div>
                <div className="relative">
                  <input type="checkbox" defaultChecked={i < 4} className="sr-only peer" />
                  <div className="w-10 h-6 bg-gray-200 dark:bg-white/10 rounded-full peer-checked:bg-brand-500 transition-colors" />
                  <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Language tab */}
        {tab === 'language' && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-400" /> Language Preference
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => i18n.changeLanguage(lang.code)}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                    i18n.language === lang.code
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/10 text-brand-600 dark:text-brand-400'
                      : 'border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-brand-200'
                  )}
                >
                  <span className="text-xl">{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
