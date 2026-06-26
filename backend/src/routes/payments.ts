import { Router } from 'express'
import Stripe from 'stripe'
import axios from 'axios'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const SessionSchema = z.object({
  provider:    z.enum(['stripe', 'paystack', 'paypal']),
  amount:      z.number().min(100),
  packageType: z.string().optional(),
})

// POST /api/payments/create-session
router.post('/create-session', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { provider, amount, packageType } = SessionSchema.parse(req.body)
    const userId = req.userId!
    const frontendUrl = process.env.FRONTEND_URL!

    // Pending transaction record
    const { data: txRecord } = await supabase
      .from('transactions')
      .insert({
        user_id:    userId,
        type:       'deposit',
        amount_usd: amount,
        method:     provider,
        status:     'pending',
      })
      .select('id')
      .single()

    const txId = txRecord?.id

    if (provider === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency:     'usd',
            product_data: { name: `ASTRO META-TRADE Deposit${packageType ? ` — ${packageType} Package` : ''}` },
            unit_amount:  Math.round(amount * 100),
          },
          quantity: 1,
        }],
        mode:        'payment',
        success_url: `${frontendUrl}/dashboard/fund?success=1&txId=${txId}`,
        cancel_url:  `${frontendUrl}/dashboard/fund?cancelled=1`,
        metadata:    { userId, txId: txId ?? '', packageType: packageType ?? '' },
      })
      return res.json({ url: session.url })
    }

    if (provider === 'paystack') {
      const { data: user } = await supabase.from('users').select('email').eq('id', userId).single()
      const { data } = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email:        user?.email,
          amount:       Math.round(amount * 100), // kobo
          currency:     'USD',
          callback_url: `${frontendUrl}/dashboard/fund?success=1&txId=${txId}`,
          metadata:     { userId, txId, packageType },
        },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      )
      return res.json({ url: data.data.authorization_url })
    }

    if (provider === 'paypal') {
      // Get PayPal access token
      const tokenRes = await axios.post(
        'https://api-m.sandbox.paypal.com/v1/oauth2/token',
        'grant_type=client_credentials',
        {
          auth: {
            username: process.env.PAYPAL_CLIENT_ID!,
            password: process.env.PAYPAL_SECRET!,
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      )
      const accessToken = tokenRes.data.access_token

      const orderRes = await axios.post(
        'https://api-m.sandbox.paypal.com/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: 'USD', value: amount.toFixed(2) },
            description: `ASTRO META-TRADE Deposit`,
            custom_id: `${userId}:${txId}`,
          }],
          application_context: {
            return_url: `${frontendUrl}/dashboard/fund?success=1&txId=${txId}`,
            cancel_url: `${frontendUrl}/dashboard/fund?cancelled=1`,
          },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      )

      const approveLink = orderRes.data.links?.find((l: any) => l.rel === 'approve')?.href
      return res.json({ url: approveLink })
    }

    res.status(400).json({ error: 'Unknown payment provider' })
  } catch (err) {
    next(err)
  }
})

// GET /api/payments/crypto-rate?coin=bitcoin
router.get('/crypto-rate', async (req, res, next) => {
  try {
    const coin = (req.query.coin as string) ?? 'bitcoin'
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: coin, vs_currencies: 'usd' },
    })
    res.json({ coin, usd: data[coin]?.usd ?? null })
  } catch (err) {
    next(err)
  }
})

export default router
