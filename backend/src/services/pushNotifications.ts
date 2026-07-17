/**
 * Web Push (VAPID) delivery for deposit-confirmed notifications.
 *
 * Unlike the in-app Notification API used while the browser process is
 * running, this hits the browser's push service directly (FCM, Mozilla
 * autopush, etc.) so a notification is delivered even if the browser is
 * fully closed — the service worker is woken up by the OS to handle it.
 *
 * VAPID keys are generated once and persisted in system_settings (same
 * pattern as the BTC xpub / ETH price cache), rather than requiring a
 * manually-provisioned secret: the private key is encrypted at rest with
 * SETTINGS_ENCRYPTION_KEY, the public key is stored in the clear since it's
 * safe to expose to any client.
 */
import webpush from 'web-push'
import { supabase } from '../lib/supabase'
import { encryptSetting, decryptSetting } from '../lib/encryption'

const PUBLIC_KEY_SETTING  = 'vapid_public_key'
const PRIVATE_KEY_SETTING = 'vapid_private_key'

let configured: { publicKey: string } | null = null
let configuringPromise: Promise<{ publicKey: string }> | null = null

/**
 * Loads VAPID keys from system_settings, generating and persisting a new
 * pair on first run, then configures the web-push library. Safe to call
 * repeatedly — subsequent calls reuse the cached result.
 */
async function ensureVapidConfigured(): Promise<{ publicKey: string }> {
  if (configured) return configured
  if (configuringPromise) return configuringPromise

  configuringPromise = (async () => {
    const { data: rows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [PUBLIC_KEY_SETTING, PRIVATE_KEY_SETTING])

    let publicKey  = rows?.find(r => r.key === PUBLIC_KEY_SETTING)?.value
    let privateEnc = rows?.find(r => r.key === PRIVATE_KEY_SETTING)?.value

    if (!publicKey || !privateEnc) {
      const generated = webpush.generateVAPIDKeys()
      publicKey  = generated.publicKey
      privateEnc = encryptSetting(generated.privateKey)

      await supabase.from('system_settings').upsert([
        { key: PUBLIC_KEY_SETTING,  value: publicKey },
        { key: PRIVATE_KEY_SETTING, value: privateEnc },
      ])
      console.log('[Push] Generated and persisted new VAPID keypair')
    }

    const privateKey = decryptSetting(privateEnc)
    webpush.setVapidDetails(
      `mailto:${process.env.SMTP_USER ?? 'admin@example.com'}`,
      publicKey,
      privateKey,
    )

    configured = { publicKey }
    return configured
  })()

  try {
    return await configuringPromise
  } finally {
    configuringPromise = null
  }
}

/** Returns the VAPID public key so the frontend can call pushManager.subscribe(). */
export async function getVapidPublicKey(): Promise<string> {
  const { publicKey } = await ensureVapidConfigured()
  return publicKey
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Upserts a subscription for the given user (re-subscribing updates keys). */
export async function saveSubscription(userId: string, sub: PushSubscriptionInput) {
  await ensureVapidConfigured()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id:  userId,
        endpoint: sub.endpoint,
        p256dh:   sub.keys.p256dh,
        auth:     sub.keys.auth,
      },
      { onConflict: 'endpoint' },
    )
  if (error) throw error
}

export async function removeSubscription(userId: string, endpoint: string) {
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
}

export interface DeviceInfo {
  id:        string   // hashed endpoint used as a stable UI key
  endpoint:  string
  label:     string   // human-readable device label derived from endpoint
  createdAt: string | null
}

/**
 * Returns a list of push-subscription "devices" for the user.
 * Extracts a human-readable label from the push endpoint URL so the UI
 * can show "Chrome · fcm.googleapis.com" without storing a user-agent.
 */
export async function getUserSubscriptions(userId: string): Promise<DeviceInfo[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!data) return []

  return data.map((row, idx) => {
    let label = 'Browser'
    try {
      const host = new URL(row.endpoint).hostname
      if (host.includes('fcm.googleapis.com'))  label = 'Chrome / Android'
      else if (host.includes('push.apple.com')) label = 'Safari'
      else if (host.includes('mozilla.com') || host.includes('autopush')) label = 'Firefox'
      else label = host
    } catch { /* ignore invalid URLs */ }

    // Use a simple index-based id since we don't have a real PK exposed here.
    // The endpoint itself is the real key for removal.
    return {
      id:        Buffer.from(row.endpoint).toString('base64').slice(0, 16),
      endpoint:  row.endpoint,
      label:     `Device ${idx + 1} · ${label}`,
      createdAt: row.created_at ?? null,
    }
  })
}

/**
 * Sends a real Web Push message to every subscription registered for a
 * user. Best-effort: failures for one subscription don't affect others.
 * Subscriptions the push service reports as gone (404/410 — user
 * uninstalled, cleared data, revoked permission) are pruned automatically.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string },
) {
  try {
    await ensureVapidConfigured()
  } catch (e) {
    console.warn('[Push] VAPID not configured — skipping push send:', e)
    return
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    console.warn('[Push] Failed to load subscriptions:', error.message)
    return
  }
  if (!subs || subs.length === 0) return

  const body = JSON.stringify(payload)

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      )
    } catch (e: any) {
      const statusCode = e?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Push service confirms this subscription is gone — prune it.
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      } else {
        console.warn(`[Push] Send failed for endpoint ${sub.endpoint.slice(0, 40)}...:`, e?.message ?? e)
      }
    }
  }))
}

/** Convenience wrapper for the deposit-confirmed push, mirroring emailService.sendDepositConfirmed. */
export async function sendDepositConfirmedPush(userId: string, amountUsd: number, coin: string) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountUsd)
  await sendPushToUser(userId, {
    title: 'Deposit confirmed',
    body:  `${fmt} in ${coin.toUpperCase()} was added to your balance.`,
    url:   '/dashboard/transactions',
  })
}
