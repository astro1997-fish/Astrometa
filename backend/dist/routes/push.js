"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const pushNotifications_1 = require("../services/pushNotifications");
const router = (0, express_1.Router)();
// GET /api/push/vapid-public-key — public; the public key is safe to expose
// to any client and is required by pushManager.subscribe().
router.get('/vapid-public-key', async (_req, res, next) => {
    try {
        const publicKey = await (0, pushNotifications_1.getVapidPublicKey)();
        res.json({ publicKey });
    }
    catch (err) {
        next(err);
    }
});
const SubscriptionSchema = zod_1.z.object({
    endpoint: zod_1.z.string().url(),
    keys: zod_1.z.object({
        p256dh: zod_1.z.string().min(1),
        auth: zod_1.z.string().min(1),
    }),
});
// POST /api/push/subscribe — save/refresh this browser's PushSubscription
router.post('/subscribe', auth_1.requireAuth, async (req, res, next) => {
    try {
        const sub = SubscriptionSchema.parse(req.body);
        await (0, pushNotifications_1.saveSubscription)(req.userId, sub);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
const UnsubscribeSchema = zod_1.z.object({
    endpoint: zod_1.z.string().url(),
});
// POST /api/push/unsubscribe — remove this browser's PushSubscription
router.post('/unsubscribe', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { endpoint } = UnsubscribeSchema.parse(req.body);
        await (0, pushNotifications_1.removeSubscription)(req.userId, endpoint);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
