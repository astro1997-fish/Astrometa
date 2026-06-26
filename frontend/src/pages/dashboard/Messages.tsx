import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, MailOpen, Inbox } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { clsx } from 'clsx'

interface AdminMessage {
  id: string
  subject: string
  body: string
  read: boolean
  created_at: string
}

export default function Messages() {
  const { user } = useAuth()
  const [messages, setMessages]   = useState<AdminMessage[]>([])
  const [selected, setSelected]   = useState<AdminMessage | null>(null)
  const [loading,  setLoading]    = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('admin_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMessages(data ?? [])
        setLoading(false)
      })
  }, [user])

  const openMessage = async (msg: AdminMessage) => {
    setSelected(msg)
    if (!msg.read) {
      await supabase.from('admin_messages').update({ read: true }).eq('id', msg.id)
      setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, read: true } : m))
    }
  }

  const unread = messages.filter(m => !m.read).length

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {unread > 0 ? `${unread} unread message${unread > 1 ? 's' : ''}` : 'All messages read'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-start p-3 rounded-xl bg-gray-50 dark:bg-white/5">
              <div className="w-8 h-8 skeleton rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-32" />
                <div className="skeleton h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">No messages yet</h3>
          <p className="text-sm text-gray-400">Your account manager will send updates here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Message list */}
          <div className="lg:col-span-2 card p-2 space-y-1">
            {messages.map((msg, i) => (
              <motion.button
                key={msg.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => openMessage(msg)}
                className={clsx(
                  'w-full text-left flex items-start gap-3 p-3 rounded-xl transition-all',
                  selected?.id === msg.id
                    ? 'bg-brand-50 dark:bg-brand-400/10'
                    : 'hover:bg-gray-50 dark:hover:bg-white/5',
                  !msg.read && 'font-semibold'
                )}
              >
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  msg.read ? 'bg-gray-100 dark:bg-white/5' : 'bg-brand-100 dark:bg-brand-400/20'
                )}>
                  {msg.read
                    ? <MailOpen className="w-3.5 h-3.5 text-gray-400" />
                    : <Mail className="w-3.5 h-3.5 text-brand-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('text-sm truncate', msg.read ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white')}>
                      {msg.subject}
                    </p>
                    {!msg.read && <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Message detail */}
          <div className="lg:col-span-3 card">
            {selected ? (
              <motion.div key={selected.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-white/5">
                  <div className="w-10 h-10 rounded-full bg-gradient-brand flex items-center justify-center text-white text-sm font-bold">
                    AM
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">ASTRO META-TRADE Team</p>
                    <p className="text-xs text-gray-400">
                      {new Date(selected.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{selected.subject}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-gray-400">
                <Mail className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Select a message to read</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
