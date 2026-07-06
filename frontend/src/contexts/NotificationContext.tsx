import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

export interface AppNotification {
  id: string          // transaction id
  type: 'deposit_confirmed'
  amountUsd: number
  coin: string
  createdAt: string   // ISO timestamp when we received it
  read: boolean
}

interface NotificationContextValue {
  notifications: AppNotification[]
  unreadCount: number
  markAllRead: () => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clearAll: () => {},
})

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const addNotification = useCallback((notif: Omit<AppNotification, 'read'>) => {
    setNotifications(prev => {
      // Deduplicate by id
      if (prev.some(n => n.id === notif.id)) return prev
      return [{ ...notif, read: false }, ...prev]
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return

    // Subscribe to any of this user's transactions being confirmed
    const channel = supabase
      .channel(`user-deposit-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any
          if (row?.status === 'confirmed' && row?.type === 'deposit') {
            const coin: string = row.coin ?? row.currency ?? 'crypto'
            const amountUsd: number = row.amount_usd ?? row.amount ?? 0

            addNotification({
              id: row.id,
              type: 'deposit_confirmed',
              amountUsd,
              coin: coin.toUpperCase(),
              createdAt: new Date().toISOString(),
            })

            // Global toast fires regardless of which page they're on
            toast.success(
              `Deposit confirmed! $${amountUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} added to your balance.`,
              { duration: 8000, id: `deposit-confirmed-${row.id}` },
            )
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, addNotification])

  // Clear notifications when user signs out
  useEffect(() => {
    if (!user) setNotifications([])
  }, [user])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
