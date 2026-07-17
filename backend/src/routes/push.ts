import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import { getVapidPublicKey, saveSubscription, removeSubscription, getUserSubscriptions } from '../services/pushNotifications'

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

// GET /api/push/subscriptions — list all push-subscribed devices for the authenticated user
router.get('/subscriptions', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const devices = await getUserSubscriptions(req.userId!)
    res.json({ devices })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/push/subscriptions — remove a specific device by endpoint
const DeleteDeviceSchema = z.object({ endpoint: z.string().url() })

router.delete('/subscriptions', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { endpoint } = DeleteDeviceSchema.parse(req.body)
    await removeSubscription(req.userId!, endpoint)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
