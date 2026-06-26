import { Router } from 'express'
import { z } from 'zod'
import { authLimiter } from '../index'
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { emailService } from '../services/email'

// ── Auth routes ───────────────────────────────────────────────────
export const authRouter = Router()

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email:    z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2),
      country:  z.string().min(2),
    })
    const { email, password, fullName, country } = schema.parse(req.body)

    const { data, error } = await supabase.auth.admin.createUser({
      email, password,
      email_confirm: false,
      user_metadata: { full_name: fullName, country },
    })
    if (error) throw error

    await supabase.from('users').insert({
      id: data.user!.id, email, full_name: fullName, country, role: 'user',
    })
    await supabase.from('balances').insert({ user_id: data.user!.id, unified_usd_balance: 0 })
    await emailService.sendWelcome(email, fullName)

    res.status(201).json({ message: 'Account created. Please verify your email.' })
  } catch (err) { next(err) }
})

authRouter.post('/2fa/verify', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { token } = z.object({ token: z.string().length(6) }).parse(req.body)
    const speakeasy = await import('speakeasy')

    const { data: profile } = await supabase
      .from('users')
      .select('two_fa_secret')
      .eq('id', req.userId!)
      .single()

    if (!profile?.two_fa_secret) return res.status(400).json({ error: '2FA not set up' })

    const valid = speakeasy.default.totp.verify({
      secret:   profile.two_fa_secret,
      encoding: 'base32',
      token,
      window:   1,
    })

    if (!valid) return res.status(401).json({ error: 'Invalid 2FA code' })
    res.json({ valid: true })
  } catch (err) { next(err) }
})

// ── Portfolio routes ───────────────────────────────────────────────
export const portfolioRouter = Router()

portfolioRouter.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [{ data: balance }, { data: investments }, { data: updates }] = await Promise.all([
      supabase.from('balances').select('unified_usd_balance').eq('user_id', req.userId!).single(),
      supabase.from('investments').select('*').eq('user_id', req.userId!),
      supabase.from('portfolio_updates').select('*').eq('user_id', req.userId!).order('created_at').limit(30),
    ])
    res.json({ balance, investments, updates })
  } catch (err) { next(err) }
})

// ── Support routes ─────────────────────────────────────────────────
export const supportRouter = Router()

supportRouter.post('/contact', async (req, res, next) => {
  try {
    const schema = z.object({
      name:    z.string().min(2),
      email:   z.string().email(),
      subject: z.string().min(3),
      message: z.string().min(10),
    })
    const body = schema.parse(req.body)

    await supabase.from('support_messages').insert({ ...body, status: 'open' })
    await emailService.sendSupportNotification(body)

    res.json({ message: 'Support request received. We\'ll respond within 2 hours.' })
  } catch (err) { next(err) }
})

// ── Admin routes ───────────────────────────────────────────────────
export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [u, d, inv, w] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact' }),
      supabase.from('transactions').select('amount_usd').eq('type', 'deposit').eq('status', 'confirmed'),
      supabase.from('investments').select('amount_usd').eq('status', 'active'),
      supabase.from('withdrawals').select('id', { count: 'exact' }).eq('status', 'pending'),
    ])
    res.json({
      totalUsers:          u.count,
      totalDeposits:       (d.data ?? []).reduce((s: number, t: any) => s + t.amount_usd, 0),
      activeAUM:           (inv.data ?? []).reduce((s: number, i: any) => s + i.amount_usd, 0),
      pendingWithdrawals:  w.count,
    })
  } catch (err) { next(err) }
})

adminRouter.patch('/withdrawals/:id', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body)
    const { id } = req.params
    await supabase.from('withdrawals').update({ status, processed_at: new Date().toISOString() }).eq('id', id)
    if (status === 'approved') {
      // Debit user balance
      const { data: wd } = await supabase.from('withdrawals').select('user_id, amount_usd').eq('id', id).single()
      if (wd) {
        const { data: bal } = await supabase.from('balances').select('unified_usd_balance').eq('user_id', wd.user_id).single()
        await supabase.from('balances').update({
          unified_usd_balance: Math.max(0, (bal?.unified_usd_balance ?? 0) - wd.amount_usd)
        }).eq('user_id', wd.user_id)
        await supabase.from('transactions').insert({
          user_id: wd.user_id, type: 'withdrawal', amount_usd: wd.amount_usd, method: 'manual', status: 'confirmed'
        })
      }
    }
    res.json({ success: true, status })
  } catch (err) { next(err) }
})

adminRouter.post('/portfolio-update', async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      investmentId:    z.string().uuid(),
      userId:          z.string().uuid(),
      newBalance:      z.number().min(0),
      returnRate:      z.string(),
      status:          z.string(),
      managerName:     z.string(),
      note:            z.string().optional(),
    })
    const body = schema.parse(req.body)

    const { data: prev } = await supabase.from('balances').select('unified_usd_balance').eq('user_id', body.userId).single()
    const prevBal = prev?.unified_usd_balance ?? 0

    await Promise.all([
      supabase.from('balances').update({ unified_usd_balance: body.newBalance }).eq('user_id', body.userId),
      supabase.from('investments').update({
        projected_return_pct: body.returnRate,
        status: body.status,
        manager_name: body.managerName,
      }).eq('id', body.investmentId),
      supabase.from('portfolio_updates').insert({
        investment_id:    body.investmentId,
        user_id:          body.userId,
        previous_balance: prevBal,
        new_balance:      body.newBalance,
        change_amount:    body.newBalance - prevBal,
        change_pct:       prevBal > 0 ? ((body.newBalance - prevBal) / prevBal * 100).toFixed(2) : '0',
        note:             body.note,
        updated_by_admin: true,
      }),
    ])

    res.json({ success: true })
  } catch (err) { next(err) }
})

adminRouter.post('/send-message', async (req, res, next) => {
  try {
    const schema = z.object({
      userId:  z.string().uuid(),
      subject: z.string().min(1),
      body:    z.string().min(1),
    })
    const { userId, subject, body: msgBody } = schema.parse(req.body)

    await supabase.from('admin_messages').insert({
      user_id: userId, from_admin: true, subject, body: msgBody, read: false,
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})
