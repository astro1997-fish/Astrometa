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

const STORAGE_PREFIX = 'astro-deposit-notifications:'
const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

function pruneExpired(list: AppNotification[]): AppNotification[] {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS
  return list.filter(n => new Date(n.createdAt).getTime() >= cutoff)
}

function loadStoredNotifications(userId: string): AppNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return pruneExpired(parsed as AppNotification[])
  } catch {
    return []
  }
}

function saveStoredNotifications(userId: string, list: AppNotification[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(list))
  } catch {
    // localStorage unavailable (e.g. private browsing quota) — fail silently,
    // notifications simply won't persist across sessions this time.
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  // Load persisted notifications for this user as soon as we know who they are
  useEffect(() => {
    if (!user?.id) return
    setNotifications(pruneExpired(loadStoredNotifications(user.id)))
  }, [user?.id])

  // Persist any change to notifications for the current user
  useEffect(() => {
    if (!user?.id) return
    saveStoredNotifications(user.id, notifications)
  }, [user?.id, notifications])

  const addNotification = useCallback((notif: Omit<AppNotification, 'read'>) => {
    setNotifications(prev => {
      // Deduplicate by id
      if (prev.some(n => n.id === notif.id)) return prev
      return [{ ...notif, read: false }, ...pruneExpired(prev)]
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
    if (user?.id) {
      try {
        localStorage.removeItem(storageKey(user.id))
      } catch {
        // ignore
      }
    }
  }, [user?.id])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
