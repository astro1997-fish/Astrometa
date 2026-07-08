import { Router, type Request, type Response } from 'express'
import Stripe from 'stripe'
import crypto from 'crypto'
import axios from 'axios'
import { supabase } from '../lib/supabase'
import { emailService } from '../services/email'
import { sendDepositConfirmedPush } from '../services/pushNotifications'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

// Helper: credit user balance and activate package
async function creditUser(userId: string, amountUsd: number, txId: string, packageType?: string) {
  // 1. Credit balance
  const { data: bal } = await supabase
    .from('balances')
    .select('unified_usd_balance')
    .eq('user_id', userId)
    .single()

  const newBalance = (bal?.unified_usd_balance ?? 0) + amountUsd

  await supabase
    .from('balances')
    .update({ unified_usd_balance: newBalance })
    .eq('user_id', userId)

  // 2. Confirm transaction
  await supabase
    .from('transactions')
    .update({ status: 'confirmed', amount_usd: amountUsd })
    .eq('id', txId)

  // 3. Activate investment package if specified
  if (packageType && ['bronze', 'silver', 'gold', 'platinum'].includes(packageType)) {
    const returnMap: Record<string, string> = { bronze: '12', silver: '22', gold: '37', platinum: '50' }
    await supabase.from('investments').insert({
      user_id:             userId,
      package_type:        packageType,
      amount_usd:          amountUsd,
      start_date:          new Date().toISOString(),
      projected_return_pct: returnMap[packageType],
      status:              'active',
      manager_name:        'ASTRO Trading Desk',
    })
  }

  // 4. Send confirmation email
  const { data: user } = await supabase.from('users').select('email, full_name').eq('id', userId).single()
  if (user) {
    await emailService.sendDepositConfirmed(user.email, user.full_name, amountUsd)
  }

  // Real Web Push notification — reaches the user even if the browser is
  // fully closed, unlike the realtime-subscription-driven in-app toast.
  try {
    await sendDepositConfirmedPush(userId, amountUsd, 'fiat')
  } catch (e) {
    console.warn('[Webhooks] Push notification failed (non-fatal):', e)
  }

  // 5. Audit log
  await supabase.from('audit_logs').insert({
    user_id:    userId,
    action:     'deposit_confirmed',
    metadata:   JSON.stringify({ amountUsd, txId, packageType }),
    ip_address: 'webhook',
  })
}

// ── Stripe webhook ──────────────────────────────────────────────────
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('[Stripe webhook] signature verification failed:', err.message)
    return res.status(400).send(`Webhook error: ${err.message}`)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { userId, txId, packageType } = session.metadata ?? {}
    const amountUsd = (session.amount_total ?? 0) / 100

    if (userId && txId) {
      await creditUser(userId, amountUsd, txId, packageType)
    }
  }

  res.json({ received: true })
})

// ── Paystack webhook ────────────────────────────────────────────────
router.post('/paystack', async (req: Request, res: Response) => {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(JSON.stringify(req.body))
    .digest('hex')

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const { event, data } = req.body

  if (event === 'charge.success') {
    const { userId, txId, packageType } = data.metadata ?? {}
    const amountUsd = (data.amount ?? 0) / 100

    if (userId && txId) {
      await creditUser(userId, amountUsd, txId, packageType)
    }
  }

  res.json({ received: true })
})

// ── PayPal webhook ──────────────────────────────────────────────────
router.post('/paypal', async (req: Request, res: Response) => {
  // Verify PayPal webhook signature
  const webhookId = process.env.PAYPAL_WEBHOOK_ID!
  try {
    const verifyRes = await axios.post(
      'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
      {
        auth_algo:         req.headers['paypal-auth-algo'],
        cert_url:          req.headers['paypal-cert-url'],
        transmission_id:   req.headers['paypal-transmission-id'],
        transmission_sig:  req.headers['paypal-transmission-sig'],
        transmission_time: req.headers['paypal-transmission-time'],
        webhook_id:        webhookId,
        webhook_event:     req.body,
      },
      { headers: { Authorization: `Bearer ${process.env.PAYPAL_ACCESS_TOKEN}` } }
    )

    if (verifyRes.data.verification_status !== 'SUCCESS') {
      return res.status(401).json({ error: 'PayPal signature verification failed' })
    }
  } catch {
    return res.status(401).json({ error: 'Could not verify PayPal webhook' })
  }

  const { event_type, resource } = req.body

  if (event_type === 'CHECKOUT.ORDER.APPROVED') {
    const customId = resource.purchase_units?.[0]?.custom_id ?? ''
    const [userId, txId] = customId.split(':')
    const amountUsd = parseFloat(resource.purchase_units?.[0]?.amount?.value ?? '0')

    if (userId && txId) {
      await creditUser(userId, amountUsd, txId)
    }
  }

  res.json({ received: true })
})

export default router
