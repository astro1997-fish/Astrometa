import { Router } from 'express'
import { z } from 'zod'
import { authLimiter } from '../middleware/rateLimiter'
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

adminRouter.get('/deposits', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, user_id, amount_usd, tx_hash, created_at, method, status, failure_reason, users!inner(full_name, email)')
      .eq('type', 'deposit')
      .in('status', ['pending', 'failed'])
      .not('tx_hash', 'is', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data ?? [])
  } catch (err) { next(err) }
})

adminRouter.post('/deposits/:id/retry', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const schema = z.object({
      txHash:    z.string().optional(),   // actual on-chain hash (for chain-based retry)
      amountUsd: z.number().positive().optional(), // manual USD override
    }).refine(d => d.txHash || d.amountUsd, {
      message: 'Provide either txHash (for on-chain retry) or amountUsd (for manual credit)',
    })
    const { txHash, amountUsd: manualAmount } = schema.parse(req.body)

    // Fetch the pending transaction
    const { data: txRecord, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, user_id, amount_usd, tx_hash, status')
      .eq('id', id)
      .single()

    if (fetchErr || !txRecord) return res.status(404).json({ error: 'Transaction not found' })
    if (!['pending', 'failed'].includes(txRecord.status)) {
      return res.status(409).json({ error: `Transaction is already ${txRecord.status} — cannot retry` })
    }

    let usdValue: number | null
    let effectiveTxHash: string
    let eventKey: string

    if (txHash) {
      // ── On-chain retry ────────────────────────────────────────────
      const rpcUrl       = process.env.ETH_RPC_URL
      const contractAddr = process.env.CONTRACT_ADDRESS
      if (!rpcUrl)       return res.status(503).json({ error: 'ETH_RPC_URL not configured — use manual amountUsd override instead' })
      if (!contractAddr) return res.status(503).json({ error: 'CONTRACT_ADDRESS not configured — use manual amountUsd override instead' })

      const ethersLib = await import('ethers') as typeof import('ethers')
      const { CONTRACT_ABI, TOKEN_MAP, getUsdValue } = await import('../services/blockchainListener')
      const provider    = new ethersLib.ethers.JsonRpcProvider(rpcUrl)

      // Wait for MIN_CONFIRMATIONS — same finality policy as the listener
      const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS ?? '12', 10)
      const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS, 60_000)
      if (!receipt)             return res.status(404).json({ error: 'Transaction not found on chain — check the hash' })
      if (receipt.status !== 1) return res.status(400).json({ error: 'Transaction reverted on chain — cannot credit' })

      // Parse the PaymentReceived event, validating both contract address and paymentId
      const iface = new ethersLib.ethers.Interface(CONTRACT_ABI)
      let parsed: import('ethers').LogDescription | null = null
      let logIndex = 0
      for (const log of receipt.logs) {
        // Guard 1: log must come from our contract, not any other contract
        if (log.address.toLowerCase() !== contractAddr.toLowerCase()) continue
        try {
          const desc = iface.parseLog({ topics: [...log.topics], data: log.data })
          if (desc && desc.name === 'PaymentReceived') {
            parsed   = desc
            logIndex = log.index
            break
          }
        } catch { /* not our event signature */ }
      }

      if (!parsed) return res.status(400).json({ error: 'No PaymentReceived event found in this transaction from the configured contract' })

      // Guard 2: paymentId in the event must match the stored tx_hash on this record
      const eventPaymentId: string = parsed.args[0]
      if (eventPaymentId.toLowerCase() !== (txRecord.tx_hash ?? '').toLowerCase()) {
        return res.status(400).json({
          error: `paymentId mismatch — event has ${eventPaymentId}, record has ${txRecord.tx_hash}. Wrong transaction hash?`,
        })
      }

      const [, , token, rawAmount] = parsed.args
      const isETH = token === ethersLib.ethers.ZeroAddress
      if (isETH) {
        usdValue = await getUsdValue('ETH', rawAmount, 18)
      } else {
        const tokenInfo = TOKEN_MAP[token.toLowerCase()]
        if (!tokenInfo) return res.status(400).json({ error: `Unknown token ${token}` })
        usdValue = await getUsdValue(tokenInfo.symbol, rawAmount, tokenInfo.decimals)
      }

      if (!usdValue || usdValue <= 0) return res.status(400).json({ error: 'ETH price unavailable or returned $0 — use manual amountUsd override instead' })

      effectiveTxHash = txHash
      eventKey        = `${txHash}:${logIndex}`
    } else {
      // ── Manual override ───────────────────────────────────────────
      usdValue        = manualAmount!
      effectiveTxHash = txRecord.tx_hash ?? `manual:${id}`
      eventKey        = `manual:${id}`
    }

    // Pass both eligible from-statuses so failed deposits can also be credited.
    // Include audit override so the log entry is distinct from automatic blockchain credits.
    const { atomicCredit } = await import('../services/blockchainListener')
    const credited = await atomicCredit(
      txRecord.id, txRecord.user_id, usdValue, effectiveTxHash, eventKey,
      ['pending', 'failed'],
      {
        action:  'deposit_admin_retry',
        source:  'admin_retry',
        mode:    txHash ? 'chain' : 'manual',
        adminId: req.userId!,
        ip:      req.ip ?? req.socket?.remoteAddress ?? 'admin',
      },
    )

    res.json({ success: true, credited, amountUsd: usdValue })
  } catch (err) { next(err) }
})

// ── BTC wallet config ──────────────────────────────────────────────────────

adminRouter.get('/btc-wallet', async (_req, res, next) => {
  try {
    Promise.resolve().then(async () => {
      const { deriveBtcAddress } = await import('../services/btcMonitor')

      const envXpub = process.env.BTC_XPUB
      let source: 'env' | 'db' | 'none' = 'none'
      let xpub: string | null = null

      if (envXpub) {
        source = 'env'
        xpub   = envXpub
      } else {
        const { data } = await import('../lib/supabase').then(m =>
          m.supabase.from('system_settings').select('value').eq('key', 'btc_xpub').maybeSingle()
        )
        if (data?.value) { source = 'db'; xpub = data.value }
      }

      if (!xpub) return res.json({ configured: false, source: 'none' })

      let firstAddress: string | null = null
      let valid = false
      try {
        // deriveBtcAddress handles both xpub and zpub version bytes
        firstAddress = deriveBtcAddress(xpub, 0)
        valid = true
      } catch { /* invalid */ }

      const isTestnet = xpub.startsWith('tpub') || xpub.startsWith('upub') || xpub.startsWith('vpub')

      res.json({ configured: true, source, valid, firstAddress, isTestnet })
    }).catch(next)
  } catch (err) { next(err) }
})

// Preview endpoint — validates format and returns first derived address without saving
adminRouter.post('/btc-wallet/preview', async (req, res, next) => {
  try {
    const { xpub } = z.object({ xpub: z.string().min(50) }).parse(req.body)
    const { deriveBtcAddress } = await import('../services/btcMonitor')

    try {
      // deriveBtcAddress handles xpub and zpub version bytes natively
      const firstAddress = deriveBtcAddress(xpub, 0)
      const isTestnet = xpub.startsWith('tpub') || xpub.startsWith('upub') || xpub.startsWith('vpub')
      return res.json({ success: true, firstAddress, isTestnet })
    } catch {
      return res.status(400).json({ error: 'Invalid xpub format' })
    }
  } catch (err) { next(err) }
})

adminRouter.post('/btc-wallet', async (req, res, next) => {
  try {
    const { xpub } = z.object({ xpub: z.string().min(50) }).parse(req.body)

    // Validate cryptographically using deriveBtcAddress, which handles xpub and zpub
    const { deriveBtcAddress, clearXpubCache, startBtcMonitor } = await import('../services/btcMonitor')

    let firstAddress: string
    try {
      firstAddress = deriveBtcAddress(xpub, 0)
    } catch {
      return res.status(400).json({ error: 'Invalid xpub — could not parse the key. Check for typos or extra spaces.' })
    }

    const isTestnet = xpub.startsWith('tpub') || xpub.startsWith('upub') || xpub.startsWith('vpub')

    // Store in system_settings (upsert)
    const { supabase } = await import('../lib/supabase')
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'btc_xpub', value: xpub, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error

    // Clear in-memory xpub cache so the monitor + payments route pick up the new value,
    // then ensure the monitor loop is running (idempotent — safe to call multiple times).
    clearXpubCache()
    startBtcMonitor()  // activates polling if not already running

    // Audit log
    await supabase.from('audit_logs').insert({
      action:    'btc_xpub_updated',
      metadata:  JSON.stringify({ firstAddress, isTestnet, source: 'admin_ui' }),
      ip_address: 'admin',
    })

    res.json({ success: true, firstAddress, isTestnet })
  } catch (err) { next(err) }
})

adminRouter.delete('/btc-wallet', async (_req, res, next) => {
  try {
    if (process.env.BTC_XPUB) {
      return res.status(409).json({
        error: 'BTC_XPUB is set via environment variable and cannot be removed from the UI. Remove the secret from your deployment settings instead.',
      })
    }

    const { supabase } = await import('../lib/supabase')
    await supabase.from('system_settings').delete().eq('key', 'btc_xpub')

    const { clearXpubCache } = await import('../services/btcMonitor')
    clearXpubCache()

    await supabase.from('audit_logs').insert({
      action:    'btc_xpub_removed',
      metadata:  JSON.stringify({ source: 'admin_ui' }),
      ip_address: 'admin',
    })

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

export default authRouter
