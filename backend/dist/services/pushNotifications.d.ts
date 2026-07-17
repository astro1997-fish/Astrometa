/** Returns the VAPID public key so the frontend can call pushManager.subscribe(). */
export declare function getVapidPublicKey(): Promise<string>;
export interface PushSubscriptionInput {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}
/** Upserts a subscription for the given user (re-subscribing updates keys). */
export declare function saveSubscription(userId: string, sub: PushSubscriptionInput): Promise<void>;
export declare function removeSubscription(userId: string, endpoint: string): Promise<void>;
/**
 * Sends a real Web Push message to every subscription registered for a
 * user. Best-effort: failures for one subscription don't affect others.
 * Subscriptions the push service reports as gone (404/410 — user
 * uninstalled, cleared data, revoked permission) are pruned automatically.
 */
export declare function sendPushToUser(userId: string, payload: {
    title: string;
    body: string;
    url: string;
}): Promise<void>;
/** Convenience wrapper for the deposit-confirmed push, mirroring emailService.sendDepositConfirmed. */
export declare function sendDepositConfirmedPush(userId: string, amountUsd: number, coin: string): Promise<void>;
