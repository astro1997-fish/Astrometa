import { Router } from 'express'
import Stripe from 'stripe'
import axios from 'axios'
import { z } from 'zod'
import { ethers } from 'ethers'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { deriveBtcAddress, getXpub } from '../services/btcMonitor'
import { getActiveEvmAddress, type EvmCoin } from '../services/depositAddresses'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const SessionSchema = z.object({
  provider:    z.enum(['stripe', 'paystack', 'paypal']),
  amount:      z.number().min(100),
  packageType: z.string().optional(),
})

// POST /api/payments/create-session  (fiat)
router.post('/create-session', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { provider, amount, packageType } = SessionSchema.parse(req.body)
    const userId = req.userId!
    const frontendUrl = process.env.FRONTEND_URL!

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
          amount:       Math.round(amount * 100),
          currency:     'USD',
          callback_url: `${frontendUrl}/dashboard/fund?success=1&txId=${txId}`,
          metadata:     { userId, txId, packageType },
        },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      )
      return res.json({ url: data.data.authorization_url })
    }

    if (provider === 'paypal') {
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
            cancel_url:  `${frontendUrl}/dashboard/fund?cancelled=1`,
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

// GET /api/payments/capabilities — which coins are currently active
router.get('/capabilities', async (_req, res, next) => {
  try {
    const [xpub, ethAddr, usdtAddr, usdcAddr] = await Promise.all([
      getXpub(),
      getActiveEvmAddress('eth'),
      getActiveEvmAddress('usdt'),
      getActiveEvmAddress('usdc'),
    ])
    res.json({
      btc:  !!xpub,
      eth:  !!ethAddr,
      usdt: !!usdtAddr,
      usdc: !!usdcAddr,
    })
  } catch (err) { next(err) }
})

// GET /api/payments/crypto-rate?coin=ethereum
router.get('/crypto-rate', async (req, res, next) => {
  try {
    const coin = (req.query.coin as string) ?? 'ethereum'
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: coin, vs_currencies: 'usd' },
    })
    res.json({ coin, usd: data[coin]?.usd ?? null })
  } catch (err) {
    next(err)
  }
})

const CryptoDepositSchema = z.object({
  coin:      z.enum(['eth', 'usdt', 'usdc', 'btc']),
  amountUsd: z.number().min(10),
})

// Cap on how much a jittered amount may differ from the requested USD value
// — keeps the extra cents invisible to the user regardless of coin or price.
const MAX_JITTER_USD = 0.01

// POST /api/payments/create-crypto-deposit
router.post('/create-crypto-deposit', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { coin, amountUsd } = CryptoDepositSchema.parse(req.body)
    const userId = req.userId!

    // ── BTC: HD-wallet address derivation ─────────────────────────────────
    if (coin === 'btc') {
      const xpub = await getXpub()
      if (!xpub) {
        return res.status(503).json({ error: 'BTC deposits are not yet active. Please contact support.' })
      }

      // Fetch base index (total BTC txs ever — used as the starting point for derivation)
      const { count: baseCount, error: countErr } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('method', 'btc')

      if (countErr) {
        console.error('[BTC] Failed to count existing BTC transactions:', countErr.message)
        return res.status(500).json({ error: 'Failed to generate BTC address. Please try again.' })
      }

      // Fetch live BTC price (parallel, non-blocking)
      let cryptoAmount: string | null = null
      try {
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
          params: { ids: 'bitcoin', vs_currencies: 'usd' },
        })
        const btcPrice: number = data['bitcoin']?.usd ?? 0
        if (btcPrice > 0) cryptoAmount = (amountUsd / btcPrice).toFixed(8)
      } catch {
        // non-fatal — frontend shows USD amount as fallback
      }

      // ── Atomic address allocation via unique-constraint + retry ───────────
      // The DB has a partial unique index on tx_hash WHERE method='btc' AND
      // status IN ('pending','confirmed'). If two concurrent requests derive
      // the same address (same baseCount), only one INSERT succeeds; the
      // other gets a 23505 unique-violation and retries with the next index.
      let btcAddress: string | null = null
      let txRecord: { id: string } | null = null
      const startIndex = baseCount ?? 0
      const btcExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 h window for BTC

      for (let attempt = 0; attempt < 10; attempt++) {
        const derivationIndex = startIndex + attempt
        let candidateAddress: string
        try {
          candidateAddress = deriveBtcAddress(xpub, derivationIndex)
        } catch (e) {
          console.error('[BTC] Address derivation failed:', e)
          return res.status(500).json({ error: 'Failed to generate BTC address. Please try again.' })
        }

        const { data, error: insertErr } = await supabase
          .from('transactions')
          .insert({
            user_id:     userId,
            type:        'deposit',
            amount_usd:  amountUsd,
            method:      'btc',
            status:      'pending',
            btc_address: candidateAddress,
            expires_at:  btcExpiresAt,
            // tx_hash intentionally left null — set to the on-chain txid on confirmation
          })
          .select('id')
          .single()

        if (!insertErr) {
          btcAddress = candidateAddress
          txRecord   = data
          break
        }

        // Unique constraint violation — address already in use; try next index
        if (insertErr.code === '23505') {
          console.warn(`[BTC] Address collision at index ${derivationIndex} — retrying (attempt ${attempt + 1})`)
          continue
        }

        // Unexpected DB error
        console.error('[BTC] Failed to insert BTC deposit:', insertErr.message)
        return res.status(500).json({ error: 'Failed to create deposit. Please try again.' })
      }

      if (!btcAddress || !txRecord) {
        console.error('[BTC] Exhausted retry attempts for unique address allocation')
        return res.status(500).json({ error: 'Failed to allocate unique BTC address. Please try again.' })
      }

      await supabase.from('audit_logs').insert({
        user_id:   userId,
        action:    'crypto_deposit_initiated',
        metadata:  JSON.stringify({ coin: 'btc', amountUsd, btcAddress }),
        ip_address: req.ip,
      })

      return res.json({
        txId:      txRecord?.id,
        btcAddress,
        coin:      'btc',
        amountUsd,
        cryptoAmount,
        expiresAt: btcExpiresAt,
      })
    }

    // ── ETH / USDT / USDC: fixed shared address + exact-amount matching ────
    const evmCoin = coin as EvmCoin
    const address = await getActiveEvmAddress(evmCoin)
    if (!address) {
      return res.status(503).json({
        error: 'Crypto deposits are not yet active. Please contact support.',
      })
    }

    const decimals    = evmCoin === 'eth' ? 18 : 6
    const ethExpiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()

    let pricePerUnit: number
    let baseCryptoAmount: number
    if (evmCoin === 'eth') {
      try {
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
          params: { ids: 'ethereum', vs_currencies: 'usd' },
        })
        const ethPrice: number = data.ethereum?.usd ?? 0
        if (!(ethPrice > 0)) {
          return res.status(503).json({ error: 'ETH price temporarily unavailable. Please try again shortly.' })
        }
        pricePerUnit     = ethPrice
        baseCryptoAmount = amountUsd / ethPrice
      } catch {
        return res.status(503).json({ error: 'ETH price temporarily unavailable. Please try again shortly.' })
      }
    } else {
      // USDT/USDC are stablecoins — 1:1 with USD
      pricePerUnit     = 1
      baseCryptoAmount = amountUsd
    }

    // ── Atomic amount allocation via unique-constraint + retry ─────────────
    // A fixed shared address can't distinguish depositors by address, so each
    // pending deposit gets a unique exact amount that the monitor matches
    // on-chain. The jitter is added directly to the raw integer (smallest
    // on-chain unit) rather than a decimal string, so its magnitude can be
    // bounded by real USD value (MAX_JITTER_USD) while still spanning a huge
    // number of possible raw offsets — e.g. ~10,000 values for stablecoins
    // and trillions for ETH — making collisions effectively impossible even
    // under heavy concurrent traffic. A partial unique index on
    // (method, match_amount) WHERE status='pending' is the hard backstop;
    // retry with a fresh jitter on violation, mirroring the BTC address
    // allocation loop above.
    const baseRaw = ethers.parseUnits(baseCryptoAmount.toFixed(decimals), decimals)
    const maxJitterRawNum = Math.max(1000, Math.floor((MAX_JITTER_USD / pricePerUnit) * 10 ** decimals))
    let txRecord: { id: string } | null = null
    let matchAmountStr: string | null = null
    let requiredRaw: bigint | null = null

    for (let attempt = 0; attempt < 20; attempt++) {
      // Random raw-unit offset in [1, maxJitterRawNum] — never zero, so the
      // amount always differs from the plain base amount too.
      const jitterOffset = BigInt(1 + Math.floor(Math.random() * maxJitterRawNum))
      const candidateRaw = baseRaw + jitterOffset
      const candidateStr = ethers.formatUnits(candidateRaw, decimals)

      const { data, error: insertErr } = await supabase
        .from('transactions')
        .insert({
          user_id:      userId,
          type:         'deposit',
          amount_usd:   amountUsd,
          method:       evmCoin,
          status:       'pending',
          match_amount: candidateStr,
          expires_at:   ethExpiresAt,
          metadata:     JSON.stringify({ address, requiredRaw: candidateRaw.toString(), decimals }),
        })
        .select('id')
        .single()

      if (!insertErr) {
        txRecord       = data
        matchAmountStr = candidateStr
        requiredRaw    = candidateRaw
        break
      }

      if (insertErr.code === '23505') {
        console.warn(`[Crypto] Match-amount collision for ${evmCoin} at ${candidateStr} — retrying (attempt ${attempt + 1})`)
        continue
      }

      console.error(`[Crypto] Failed to insert ${evmCoin} deposit:`, insertErr.message)
      return res.status(500).json({ error: 'Failed to create deposit. Please try again.' })
    }

    if (!txRecord || !matchAmountStr || requiredRaw === null) {
      console.error(`[Crypto] Exhausted retry attempts for unique ${evmCoin} match amount`)
      return res.status(500).json({ error: 'Failed to allocate a unique deposit amount. Please try again.' })
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id:   userId,
      action:    'crypto_deposit_initiated',
      metadata:  JSON.stringify({ coin: evmCoin, amountUsd, address, matchAmount: matchAmountStr }),
      ip_address: req.ip,
    })

    res.json({
      txId:         txRecord.id,
      coin:         evmCoin,
      address,
      amountUsd,
      cryptoAmount: matchAmountStr,
      expiresAt:    ethExpiresAt,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/payments/deposits — recent crypto deposits for the logged-in user
router.get('/deposits', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!
    const { data, error } = await supabase
      .from('transactions')
      .select('id, method, amount_usd, status, tx_hash, btc_address, created_at, expires_at, metadata')
      .eq('user_id', userId)
      .eq('type', 'deposit')
      .in('method', ['eth', 'usdt', 'usdc', 'btc'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    next(err)
  }
})

// DELETE /api/payments/deposits/:id — cancel a pending deposit before it expires
router.delete('/deposits/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id } = req.params

    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, user_id, status')
      .eq('id', id)
      .single()

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Deposit not found' })
    }
    if (existing.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to cancel this deposit' })
    }
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending deposits can be cancelled' })
    }

    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({ status: 'failed', failure_reason: 'Cancelled by user' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, status')
      .single()

    if (updateErr || !updated) {
      return res.status(409).json({ error: 'Deposit could not be cancelled — it may have already updated' })
    }

    await supabase.from('audit_logs').insert({
      user_id:    userId,
      action:     'crypto_deposit_cancelled',
      metadata:   JSON.stringify({ txId: id }),
      ip_address: req.ip,
    })

    res.json({ id: updated.id, status: updated.status })
  } catch (err) {
    next(err)
  }
})

export default router
