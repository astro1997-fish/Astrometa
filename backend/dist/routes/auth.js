"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = exports.supportRouter = exports.portfolioRouter = exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const rateLimiter_1 = require("../middleware/rateLimiter");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../lib/supabase");
const email_1 = require("../services/email");
// ── Auth routes ───────────────────────────────────────────────────
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post('/register', rateLimiter_1.authLimiter, async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            email: zod_1.z.string().email(),
            password: zod_1.z.string().min(8),
            fullName: zod_1.z.string().min(2),
            country: zod_1.z.string().min(2),
        });
        const { email, password, fullName, country } = schema.parse(req.body);
        const { data, error } = await supabase_1.supabase.auth.admin.createUser({
            email, password,
            email_confirm: false,
            user_metadata: { full_name: fullName, country },
        });
        if (error)
            throw error;
        await supabase_1.supabase.from('users').insert({
            id: data.user.id, email, full_name: fullName, country, role: 'user',
        });
        await supabase_1.supabase.from('balances').insert({ user_id: data.user.id, unified_usd_balance: 0 });
        await email_1.emailService.sendWelcome(email, fullName);
        res.status(201).json({ message: 'Account created. Please verify your email.' });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post('/2fa/verify', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { token } = zod_1.z.object({ token: zod_1.z.string().length(6) }).parse(req.body);
        const speakeasy = await Promise.resolve().then(() => __importStar(require('speakeasy')));
        const { data: profile } = await supabase_1.supabase
            .from('users')
            .select('two_fa_secret')
            .eq('id', req.userId)
            .single();
        if (!profile?.two_fa_secret)
            return res.status(400).json({ error: '2FA not set up' });
        const valid = speakeasy.default.totp.verify({
            secret: profile.two_fa_secret,
            encoding: 'base32',
            token,
            window: 1,
        });
        if (!valid)
            return res.status(401).json({ error: 'Invalid 2FA code' });
        res.json({ valid: true });
    }
    catch (err) {
        next(err);
    }
});
// ── Portfolio routes ───────────────────────────────────────────────
exports.portfolioRouter = (0, express_1.Router)();
exports.portfolioRouter.get('/me', auth_1.requireAuth, async (req, res, next) => {
    try {
        const [{ data: balance }, { data: investments }, { data: updates }] = await Promise.all([
            supabase_1.supabase.from('balances').select('unified_usd_balance').eq('user_id', req.userId).single(),
            supabase_1.supabase.from('investments').select('*').eq('user_id', req.userId),
            supabase_1.supabase.from('portfolio_updates').select('*').eq('user_id', req.userId).order('created_at').limit(30),
        ]);
        res.json({ balance, investments, updates });
    }
    catch (err) {
        next(err);
    }
});
// ── Support routes ─────────────────────────────────────────────────
exports.supportRouter = (0, express_1.Router)();
exports.supportRouter.post('/contact', async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2),
            email: zod_1.z.string().email(),
            subject: zod_1.z.string().min(3),
            message: zod_1.z.string().min(10),
        });
        const body = schema.parse(req.body);
        await supabase_1.supabase.from('support_messages').insert({ ...body, status: 'open' });
        await email_1.emailService.sendSupportNotification(body);
        res.json({ message: 'Support request received. We\'ll respond within 2 hours.' });
    }
    catch (err) {
        next(err);
    }
});
// ── Admin routes ───────────────────────────────────────────────────
exports.adminRouter = (0, express_1.Router)();
exports.adminRouter.use(auth_1.requireAuth, auth_1.requireAdmin);
exports.adminRouter.get('/stats', async (_req, res, next) => {
    try {
        const [u, d, inv, w] = await Promise.all([
            supabase_1.supabase.from('users').select('id', { count: 'exact' }),
            supabase_1.supabase.from('transactions').select('amount_usd').eq('type', 'deposit').eq('status', 'confirmed'),
            supabase_1.supabase.from('investments').select('amount_usd').eq('status', 'active'),
            supabase_1.supabase.from('withdrawals').select('id', { count: 'exact' }).eq('status', 'pending'),
        ]);
        res.json({
            totalUsers: u.count,
            totalDeposits: (d.data ?? []).reduce((s, t) => s + t.amount_usd, 0),
            activeAUM: (inv.data ?? []).reduce((s, i) => s + i.amount_usd, 0),
            pendingWithdrawals: w.count,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.patch('/withdrawals/:id', async (req, res, next) => {
    try {
        const { status } = zod_1.z.object({ status: zod_1.z.enum(['approved', 'rejected']) }).parse(req.body);
        const { id } = req.params;
        await supabase_1.supabase.from('withdrawals').update({ status, processed_at: new Date().toISOString() }).eq('id', id);
        if (status === 'approved') {
            // Debit user balance
            const { data: wd } = await supabase_1.supabase.from('withdrawals').select('user_id, amount_usd').eq('id', id).single();
            if (wd) {
                const { data: bal } = await supabase_1.supabase.from('balances').select('unified_usd_balance').eq('user_id', wd.user_id).single();
                await supabase_1.supabase.from('balances').update({
                    unified_usd_balance: Math.max(0, (bal?.unified_usd_balance ?? 0) - wd.amount_usd)
                }).eq('user_id', wd.user_id);
                await supabase_1.supabase.from('transactions').insert({
                    user_id: wd.user_id, type: 'withdrawal', amount_usd: wd.amount_usd, method: 'manual', status: 'confirmed'
                });
            }
        }
        res.json({ success: true, status });
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.post('/portfolio-update', async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            investmentId: zod_1.z.string().uuid(),
            userId: zod_1.z.string().uuid(),
            newBalance: zod_1.z.number().min(0),
            returnRate: zod_1.z.string(),
            status: zod_1.z.string(),
            managerName: zod_1.z.string(),
            note: zod_1.z.string().optional(),
        });
        const body = schema.parse(req.body);
        const { data: prev } = await supabase_1.supabase.from('balances').select('unified_usd_balance').eq('user_id', body.userId).single();
        const prevBal = prev?.unified_usd_balance ?? 0;
        await Promise.all([
            supabase_1.supabase.from('balances').update({ unified_usd_balance: body.newBalance }).eq('user_id', body.userId),
            supabase_1.supabase.from('investments').update({
                projected_return_pct: body.returnRate,
                status: body.status,
                manager_name: body.managerName,
            }).eq('id', body.investmentId),
            supabase_1.supabase.from('portfolio_updates').insert({
                investment_id: body.investmentId,
                user_id: body.userId,
                previous_balance: prevBal,
                new_balance: body.newBalance,
                change_amount: body.newBalance - prevBal,
                change_pct: prevBal > 0 ? ((body.newBalance - prevBal) / prevBal * 100).toFixed(2) : '0',
                note: body.note,
                updated_by_admin: true,
            }),
        ]);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.get('/deposits', async (_req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('transactions')
            .select('id, user_id, amount_usd, tx_hash, created_at, method, status, users!inner(full_name, email)')
            .eq('type', 'deposit')
            .in('status', ['pending', 'failed'])
            .not('tx_hash', 'is', null)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json(data ?? []);
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.post('/deposits/:id/retry', async (req, res, next) => {
    try {
        const { id } = req.params;
        const schema = zod_1.z.object({
            txHash: zod_1.z.string().optional(), // actual on-chain hash (for chain-based retry)
            amountUsd: zod_1.z.number().positive().optional(), // manual USD override
        }).refine(d => d.txHash || d.amountUsd, {
            message: 'Provide either txHash (for on-chain retry) or amountUsd (for manual credit)',
        });
        const { txHash, amountUsd: manualAmount } = schema.parse(req.body);
        // Fetch the pending transaction
        const { data: txRecord, error: fetchErr } = await supabase_1.supabase
            .from('transactions')
            .select('id, user_id, amount_usd, tx_hash, status')
            .eq('id', id)
            .single();
        if (fetchErr || !txRecord)
            return res.status(404).json({ error: 'Transaction not found' });
        if (!['pending', 'failed'].includes(txRecord.status)) {
            return res.status(409).json({ error: `Transaction is already ${txRecord.status} — cannot retry` });
        }
        let usdValue;
        let effectiveTxHash;
        let eventKey;
        if (txHash) {
            // ── On-chain retry ────────────────────────────────────────────
            const rpcUrl = process.env.ETH_RPC_URL;
            const contractAddr = process.env.CONTRACT_ADDRESS;
            if (!rpcUrl)
                return res.status(503).json({ error: 'ETH_RPC_URL not configured — use manual amountUsd override instead' });
            if (!contractAddr)
                return res.status(503).json({ error: 'CONTRACT_ADDRESS not configured — use manual amountUsd override instead' });
            const ethersLib = await Promise.resolve().then(() => __importStar(require('ethers')));
            const { CONTRACT_ABI, TOKEN_MAP, getUsdValue } = await Promise.resolve().then(() => __importStar(require('../services/blockchainListener')));
            const provider = new ethersLib.ethers.JsonRpcProvider(rpcUrl);
            // Wait for MIN_CONFIRMATIONS — same finality policy as the listener
            const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS ?? '12', 10);
            const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS, 60000);
            if (!receipt)
                return res.status(404).json({ error: 'Transaction not found on chain — check the hash' });
            if (receipt.status !== 1)
                return res.status(400).json({ error: 'Transaction reverted on chain — cannot credit' });
            // Parse the PaymentReceived event, validating both contract address and paymentId
            const iface = new ethersLib.ethers.Interface(CONTRACT_ABI);
            let parsed = null;
            let logIndex = 0;
            for (const log of receipt.logs) {
                // Guard 1: log must come from our contract, not any other contract
                if (log.address.toLowerCase() !== contractAddr.toLowerCase())
                    continue;
                try {
                    const desc = iface.parseLog({ topics: [...log.topics], data: log.data });
                    if (desc && desc.name === 'PaymentReceived') {
                        parsed = desc;
                        logIndex = log.index;
                        break;
                    }
                }
                catch { /* not our event signature */ }
            }
            if (!parsed)
                return res.status(400).json({ error: 'No PaymentReceived event found in this transaction from the configured contract' });
            // Guard 2: paymentId in the event must match the stored tx_hash on this record
            const eventPaymentId = parsed.args[0];
            if (eventPaymentId.toLowerCase() !== (txRecord.tx_hash ?? '').toLowerCase()) {
                return res.status(400).json({
                    error: `paymentId mismatch — event has ${eventPaymentId}, record has ${txRecord.tx_hash}. Wrong transaction hash?`,
                });
            }
            const [, , token, rawAmount] = parsed.args;
            const isETH = token === ethersLib.ethers.ZeroAddress;
            if (isETH) {
                usdValue = await getUsdValue('ETH', rawAmount, 18);
            }
            else {
                const tokenInfo = TOKEN_MAP[token.toLowerCase()];
                if (!tokenInfo)
                    return res.status(400).json({ error: `Unknown token ${token}` });
                usdValue = await getUsdValue(tokenInfo.symbol, rawAmount, tokenInfo.decimals);
            }
            if (!usdValue || usdValue <= 0)
                return res.status(400).json({ error: 'ETH price unavailable or returned $0 — use manual amountUsd override instead' });
            effectiveTxHash = txHash;
            eventKey = `${txHash}:${logIndex}`;
        }
        else {
            // ── Manual override ───────────────────────────────────────────
            usdValue = manualAmount;
            effectiveTxHash = txRecord.tx_hash ?? `manual:${id}`;
            eventKey = `manual:${id}`;
        }
        // Pass both eligible from-statuses so failed deposits can also be credited
        const { atomicCredit } = await Promise.resolve().then(() => __importStar(require('../services/blockchainListener')));
        const credited = await atomicCredit(txRecord.id, txRecord.user_id, usdValue, effectiveTxHash, eventKey, ['pending', 'failed']);
        res.json({ success: true, credited, amountUsd: usdValue });
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.post('/send-message', async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            userId: zod_1.z.string().uuid(),
            subject: zod_1.z.string().min(1),
            body: zod_1.z.string().min(1),
        });
        const { userId, subject, body: msgBody } = schema.parse(req.body);
        await supabase_1.supabase.from('admin_messages').insert({
            user_id: userId, from_admin: true, subject, body: msgBody, read: false,
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = exports.authRouter;
