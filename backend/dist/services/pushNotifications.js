"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVapidPublicKey = getVapidPublicKey;
exports.saveSubscription = saveSubscription;
exports.removeSubscription = removeSubscription;
exports.sendPushToUser = sendPushToUser;
exports.sendDepositConfirmedPush = sendDepositConfirmedPush;
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
const web_push_1 = __importDefault(require("web-push"));
const supabase_1 = require("../lib/supabase");
const encryption_1 = require("../lib/encryption");
const PUBLIC_KEY_SETTING = 'vapid_public_key';
const PRIVATE_KEY_SETTING = 'vapid_private_key';
let configured = null;
let configuringPromise = null;
/**
 * Loads VAPID keys from system_settings, generating and persisting a new
 * pair on first run, then configures the web-push library. Safe to call
 * repeatedly — subsequent calls reuse the cached result.
 */
async function ensureVapidConfigured() {
    if (configured)
        return configured;
    if (configuringPromise)
        return configuringPromise;
    configuringPromise = (async () => {
        const { data: rows } = await supabase_1.supabase
            .from('system_settings')
            .select('key, value')
            .in('key', [PUBLIC_KEY_SETTING, PRIVATE_KEY_SETTING]);
        let publicKey = rows?.find(r => r.key === PUBLIC_KEY_SETTING)?.value;
        let privateEnc = rows?.find(r => r.key === PRIVATE_KEY_SETTING)?.value;
        if (!publicKey || !privateEnc) {
            const generated = web_push_1.default.generateVAPIDKeys();
            publicKey = generated.publicKey;
            privateEnc = (0, encryption_1.encryptSetting)(generated.privateKey);
            await supabase_1.supabase.from('system_settings').upsert([
                { key: PUBLIC_KEY_SETTING, value: publicKey },
                { key: PRIVATE_KEY_SETTING, value: privateEnc },
            ]);
            console.log('[Push] Generated and persisted new VAPID keypair');
        }
        const privateKey = (0, encryption_1.decryptSetting)(privateEnc);
        web_push_1.default.setVapidDetails(`mailto:${process.env.SMTP_USER ?? 'admin@example.com'}`, publicKey, privateKey);
        configured = { publicKey };
        return configured;
    })();
    try {
        return await configuringPromise;
    }
    finally {
        configuringPromise = null;
    }
}
/** Returns the VAPID public key so the frontend can call pushManager.subscribe(). */
async function getVapidPublicKey() {
    const { publicKey } = await ensureVapidConfigured();
    return publicKey;
}
/** Upserts a subscription for the given user (re-subscribing updates keys). */
async function saveSubscription(userId, sub) {
    await ensureVapidConfigured();
    const { error } = await supabase_1.supabase
        .from('push_subscriptions')
        .upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
    }, { onConflict: 'endpoint' });
    if (error)
        throw error;
}
async function removeSubscription(userId, endpoint) {
    await supabase_1.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
}
/**
 * Sends a real Web Push message to every subscription registered for a
 * user. Best-effort: failures for one subscription don't affect others.
 * Subscriptions the push service reports as gone (404/410 — user
 * uninstalled, cleared data, revoked permission) are pruned automatically.
 */
async function sendPushToUser(userId, payload) {
    try {
        await ensureVapidConfigured();
    }
    catch (e) {
        console.warn('[Push] VAPID not configured — skipping push send:', e);
        return;
    }
    const { data: subs, error } = await supabase_1.supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);
    if (error) {
        console.warn('[Push] Failed to load subscriptions:', error.message);
        return;
    }
    if (!subs || subs.length === 0)
        return;
    const body = JSON.stringify(payload);
    await Promise.all(subs.map(async (sub) => {
        try {
            await web_push_1.default.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
        }
        catch (e) {
            const statusCode = e?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                // Push service confirms this subscription is gone — prune it.
                await supabase_1.supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
            else {
                console.warn(`[Push] Send failed for endpoint ${sub.endpoint.slice(0, 40)}...:`, e?.message ?? e);
            }
        }
    }));
}
/** Convenience wrapper for the deposit-confirmed push, mirroring emailService.sendDepositConfirmed. */
async function sendDepositConfirmedPush(userId, amountUsd, coin) {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountUsd);
    await sendPushToUser(userId, {
        title: 'Deposit confirmed',
        body: `${fmt} in ${coin.toUpperCase()} was added to your balance.`,
        url: '/dashboard/transactions',
    });
}
