import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import toast from 'react-hot-toast'

export interface AppNotification {
  id: string          // transaction id
  type: 'deposit_confirmed'
  amountUsd: number
  coin: string
  createdAt: string   // ISO timestamp when we received it
  read: boolean
}

type PushPermission = NotificationPermission | 'unsupported'

interface NotificationContextValue {
  notifications: AppNotification[]
  unreadCount: number
  markAllRead: () => void
  clearAll: () => void
  pushSupported: boolean
  pushPermission: PushPermission
  pushEnabled: boolean
  pushPromptDismissed: boolean
  enablePush: () => Promise<boolean>
  disablePush: () => void
  dismissPushPrompt: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  clearAll: () => {},
  pushSupported: false,
  pushPermission: 'unsupported',
  pushEnabled: false,
  pushPromptDismissed: true,
  enablePush: async () => false,
  disablePush: () => {},
  dismissPushPrompt: () => {},
})

const STORAGE_PREFIX = 'astro-deposit-notifications:'
const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const PUSH_ENABLED_PREFIX = 'astro-push-enabled:'
const PUSH_DISMISSED_PREFIX = 'astro-push-dismissed:'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

function pushEnabledKey(userId: string) {
  return `${PUSH_ENABLED_PREFIX}${userId}`
}

function pushDismissedKey(userId: string) {
  return `${PUSH_DISMISSED_PREFIX}${userId}`
}

const PUSH_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window

/** Converts the VAPID public key (base64url) to the Uint8Array pushManager.subscribe() expects. */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i)
  return bytes.buffer
}

/**
 * Subscribes this browser to real Web Push (VAPID) and registers the
 * subscription with the backend, so deposit-confirmed notifications are
 * delivered even if the browser is fully closed. Best-effort: if this
 * fails, the in-app realtime toast/notification path still works whenever
 * the browser process is running.
 */
async function subscribeToWebPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    const { data } = await api.get('/api/push/vapid-public-key')
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    })
  }

  await api.post('/api/push/subscribe', subscription.toJSON())
}

/** Unsubscribes this browser from Web Push and tells the backend to drop it. */
async function unsubscribeFromWebPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await api.post('/api/push/unsubscribe', { endpoint }).catch(() => {
    // Best-effort — the subscription is already gone client-side either way.
  })
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
  const [pushPermission, setPushPermission] = useState<PushPermission>(
    PUSH_SUPPORTED ? Notification.permission : 'unsupported',
  )
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushPromptDismissed, setPushPromptDismissed] = useState(true)

  // Register the service worker once, regardless of permission state, so it's
  // ready the moment the user opts in.
  useEffect(() => {
    if (!PUSH_SUPPORTED) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures (e.g. unsupported browser edge cases) just mean
      // push notifications silently stay unavailable.
    })
  }, [])

  // Load this user's push opt-in state, and re-establish the real Web Push
  // subscription if it was previously granted (e.g. after a service worker
  // update invalidated the old subscription, or on a new browser session).
  useEffect(() => {
    if (!user?.id || !PUSH_SUPPORTED) return
    try {
      const enabled = localStorage.getItem(pushEnabledKey(user.id)) === 'true'
      const isEnabled = enabled && Notification.permission === 'granted'
      setPushEnabled(isEnabled)
      setPushPromptDismissed(localStorage.getItem(pushDismissedKey(user.id)) === 'true')
      if (isEnabled) {
        subscribeToWebPush().catch((e) => console.warn('Web Push re-subscription failed:', e))
      }
    } catch {
      // ignore
    }
  }, [user?.id])

  // Keep local permission state in sync (e.g. if the user changes it via
  // the browser's site settings while the app is open).
  useEffect(() => {
    if (!PUSH_SUPPORTED) return
    const interval = setInterval(() => {
      setPushPermission(prev => (prev !== Notification.permission ? Notification.permission : prev))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (pushPermission === 'denied' && pushEnabled) setPushEnabled(false)
  }, [pushPermission, pushEnabled])

  const enablePush = useCallback(async () => {
    if (!user?.id || !PUSH_SUPPORTED) return false
    const result = await Notification.requestPermission()
    setPushPermission(result)
    const granted = result === 'granted'
    setPushEnabled(granted)
    try {
      localStorage.setItem(pushEnabledKey(user.id), String(granted))
      localStorage.setItem(pushDismissedKey(user.id), 'true')
    } catch {
      // ignore
    }
    setPushPromptDismissed(true)

    if (granted) {
      try {
        await subscribeToWebPush()
      } catch (e) {
        // Real push registration failed (e.g. push service unreachable) —
        // the in-app notification path while the browser is open still works.
        console.warn('Web Push subscription failed:', e)
      }
    }

    return granted
  }, [user?.id])

  const disablePush = useCallback(() => {
    if (!user?.id) return
    setPushEnabled(false)
    try {
      localStorage.setItem(pushEnabledKey(user.id), 'false')
    } catch {
      // ignore
    }
    unsubscribeFromWebPush().catch(() => {
      // Best-effort — nothing more to do if this fails.
    })
  }, [user?.id])

  const dismissPushPrompt = useCallback(() => {
    if (!user?.id) return
    setPushPromptDismissed(true)
    try {
      localStorage.setItem(pushDismissedKey(user.id), 'true')
    } catch {
      // ignore
    }
  }, [user?.id])

  const sendPushNotification = useCallback(async (title: string, body: string, url: string) => {
    if (!PUSH_SUPPORTED || Notification.permission !== 'granted') return
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        await registration.showNotification(title, {
          body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          data: { url },
        })
      } else {
        new Notification(title, { body, icon: '/favicon.svg' })
      }
    } catch {
      // Some browsers restrict Notification() from page scripts; the
      // service-worker path above covers those cases already.
    }
  }, [])

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

            const formattedAmount = `${amountUsd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`

            // Global toast fires regardless of which page they're on
            toast.success(
              `Deposit confirmed! ${formattedAmount} added to your balance.`,
              { duration: 8000, id: `deposit-confirmed-${row.id}` },
            )

            if (pushEnabled) {
              sendPushNotification(
                'Deposit confirmed',
                `${formattedAmount} in ${coin.toUpperCase()} was added to your balance.`,
                '/dashboard/transactions',
              )
            }
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, addNotification, pushEnabled, sendPushNotification])

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
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAllRead,
        clearAll,
        pushSupported: PUSH_SUPPORTED,
        pushPermission,
        pushEnabled,
        pushPromptDismissed,
        enablePush,
        disablePush,
        dismissPushPrompt,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
