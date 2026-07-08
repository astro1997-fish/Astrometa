---
name: web-push-vapid
description: How closed-browser Web Push (VAPID) is implemented — key storage, subscription table, and where it's triggered.
---

Real Web Push (delivers even when the browser is fully closed, unlike the in-app Notification API that needs a live tab/process) uses the `web-push` npm package with VAPID keys.

**Key storage decision:** VAPID keys are generated lazily on first use and persisted in `system_settings` (public key plain, private key AES-256-GCM encrypted via the existing `encryptSetting`/`decryptSetting` helpers) — the same pattern as the BTC xpub — rather than requested as a Replit secret. **Why:** these are self-generated app key material with no external account attached, and `requestSecrets` requires the user to type a value into a form, which doesn't fit a value the agent generates itself.

**Subscription storage:** each browser/device's `PushSubscription` (endpoint + p256dh/auth keys) is a row in `push_subscriptions`, keyed by user. Rows are pruned automatically when the push service returns 404/410 (subscription gone).

**How to apply:** any new "notify user of event X" flow that needs closed-browser delivery should call the existing `sendPushToUser`/`sendDepositConfirmedPush` helpers in `backend/src/services/pushNotifications.ts` rather than inventing a new VAPID setup — reuse the same key material and subscription table.
