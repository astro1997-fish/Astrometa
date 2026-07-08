import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import { getVapidPublicKey, saveSubscription, removeSubscription } from '../services/pushNotifications'

const router = Router()

// GET /api/push/vapid-public-key — public; the public key is safe to expose
// to any client and is required by pushManager.subscribe().
router.get('/vapid-public-key', async (_req, res, next) => {
  try {
    const publicKey = await getVapidPublicKey()
    res.json({ publicKey })
  } catch (err) {
    next(err)
  }
})

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
})

// POST /api/push/subscribe — save/refresh this browser's PushSubscription
router.post('/subscribe', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const sub = SubscriptionSchema.parse(req.body)
    await saveSubscription(req.userId!, sub)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

// POST /api/push/unsubscribe — remove this browser's PushSubscription
router.post('/unsubscribe', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { endpoint } = UnsubscribeSchema.parse(req.body)
    await removeSubscription(req.userId!, endpoint)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
