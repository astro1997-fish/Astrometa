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
const holdingsPrices_1 = require("../services/holdingsPrices");
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
            email_confirm: true, // mark confirmed — no email is sent via admin API
            user_metadata: { full_name: fullName, country },
        });
        if (error)
            throw error;
        const userId = data.user.id;
        // Upsert so a retry after a partial failure doesn't duplicate rows
        const { error: userErr } = await supabase_1.supabase.from('users').upsert({ id: userId, email, full_name: fullName, country, role: 'user' }, { onConflict: 'id' });
        if (userErr)
            throw userErr;
        const { error: balErr } = await supabase_1.supabase.from('balances').upsert({ user_id: userId, unified_usd_balance: 0 }, { onConflict: 'user_id' });
        if (balErr)
            throw balErr;
        // Welcome email is best-effort — don't fail the signup if it errors
        email_1.emailService.sendWelcome(email, fullName).catch((e) => console.error('[register] welcome email failed:', e));
        res.status(201).json({ message: 'Account created successfully.' });
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
// Multi-asset holdings breakdown (USD/USDT/BTC/ETH) shown on the Portfolio
// page. Quantities come from `asset_holdings`; USD/BTC/ETH prices (and BTC's
// 24h % change) are looked up live so the numbers move like a real exchange.
exports.portfolioRouter.get('/holdings', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { data: holdings, error } = await supabase_1.supabase
            .from('asset_holdings')
            .select('asset, quantity, updated_at')
            .eq('user_id', req.userId)
            .gt('quantity', 0);
        if (error)
            throw error;
        const livePrices = await (0, holdingsPrices_1.getLiveAssetPrices)();
        const rows = (holdings ?? []).map(h => {
            const isPegged = h.asset === 'USD' || h.asset === 'USDT';
            const price = isPegged ? 1 : livePrices[h.asset]?.usd ?? 0;
            const change24hPct = isPegged ? 0.01 : livePrices[h.asset]?.usd_24h_change ?? 0;
            const quantity = Number(h.quantity);
            const value = quantity * price;
            return {
                asset: h.asset,
                quantity,
                price,
                change24hPct,
                value,
                change24hUsd: value * (change24hPct / 100),
            };
        }).sort((a, b) => b.value - a.value);
        res.json({ holdings: rows });
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
        const [u, d, inv, w, pp] = await Promise.all([
            supabase_1.supabase.from('users').select('id', { count: 'exact' }),
            supabase_1.supabase.from('transactions').select('amount_usd').eq('type', 'deposit').eq('status', 'confirmed'),
            supabase_1.supabase.from('investments').select('amount_usd').eq('status', 'active'),
            supabase_1.supabase.from('withdrawals').select('id', { count: 'exact' }).eq('status', 'pending'),
            supabase_1.supabase.from('transactions').select('id', { count: 'exact' }).eq('type', 'deposit').eq('status', 'pending_price'),
        ]);
        res.json({
            totalUsers: u.count,
            totalDeposits: (d.data ?? []).reduce((s, t) => s + t.amount_usd, 0),
            activeAUM: (inv.data ?? []).reduce((s, i) => s + i.amount_usd, 0),
            pendingWithdrawals: w.count,
            pendingPriceCount: pp.count ?? 0,
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
            .select('id, user_id, amount_usd, tx_hash, btc_address, match_amount, created_at, method, status, failure_reason, metadata, users!inner(full_name, email)')
            .eq('type', 'deposit')
            .in('status', ['pending', 'failed', 'pending_price'])
            // A deposit only gets tx_hash once confirmed. While pending/stuck it
            // instead carries whichever identifier its flow allocated up front:
            // btc_address for BTC (per-user derived address), match_amount for
            // fixed-address ETH/USDT/USDC (unique required amount). Require one of
            // the three so stuck deposits of any coin aren't hidden from admins.
            .or('tx_hash.not.is.null,btc_address.not.is.null,match_amount.not.is.null')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json(data ?? []);
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.post('/deposits/retry-pending-price', async (_req, res, next) => {
    try {
        const { retryPendingPriceTransactions } = await Promise.resolve().then(() => __importStar(require('../services/blockchainListener')));
        await retryPendingPriceTransactions();
        res.json({ success: true });
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
            .select('id, user_id, amount_usd, tx_hash, status, method, match_amount, metadata')
            .eq('id', id)
            .single();
        if (fetchErr || !txRecord)
            return res.status(404).json({ error: 'Transaction not found' });
        if (!['pending', 'failed', 'pending_price'].includes(txRecord.status)) {
            return res.status(409).json({ error: `Transaction is already ${txRecord.status} — cannot retry` });
        }
        let usdValue;
        let effectiveTxHash;
        let eventKey;
        if (txHash) {
            // ── On-chain retry — verifies the tx pays an active fixed deposit
            // address for the transaction's coin (eth/usdt/usdc). ──────────────
            const coin = txRecord.method;
            if (coin !== 'eth' && coin !== 'usdt' && coin !== 'usdc') {
                return res.status(400).json({ error: `txHash-based retry is not supported for method "${coin}" — use manual amountUsd override instead` });
            }
            // Resolve the exact raw amount this specific deposit was allocated, so
            // the supplied tx hash can only credit its own record — not any other
            // pending deposit for the same coin.
            let expectedRaw;
            try {
                const meta = txRecord.metadata ? JSON.parse(txRecord.metadata) : null;
                if (meta?.requiredRaw) {
                    expectedRaw = BigInt(meta.requiredRaw);
                }
                else if (txRecord.match_amount) {
                    const ethersLib = await Promise.resolve().then(() => __importStar(require('ethers')));
                    const decimals = coin === 'eth' ? 18 : 6;
                    expectedRaw = ethersLib.ethers.parseUnits(txRecord.match_amount, decimals);
                }
                else {
                    return res.status(400).json({ error: 'This deposit has no allocated match amount to verify against — use manual amountUsd override instead' });
                }
            }
            catch {
                return res.status(500).json({ error: 'Could not parse this deposit\'s expected amount' });
            }
            const { verifyEvmTransaction } = await Promise.resolve().then(() => __importStar(require('../services/blockchainListener')));
            const result = await verifyEvmTransaction(coin, txHash, expectedRaw);
            if ('error' in result)
                return res.status(400).json({ error: result.error });
            usdValue = result.usdValue;
            effectiveTxHash = txHash;
            eventKey = `${txHash}:manual-retry`;
        }
        else {
            // ── Manual override ───────────────────────────────────────────
            usdValue = manualAmount;
            effectiveTxHash = txRecord.tx_hash ?? `manual:${id}`;
            eventKey = `manual:${id}`;
        }
        // Pass both eligible from-statuses so failed deposits can also be credited.
        // Include audit override so the log entry is distinct from automatic blockchain credits.
        const { atomicCredit } = await Promise.resolve().then(() => __importStar(require('../services/blockchainListener')));
        const credited = await atomicCredit(txRecord.id, txRecord.user_id, usdValue, effectiveTxHash, eventKey, ['pending', 'failed', 'pending_price'], {
            action: 'deposit_admin_retry',
            source: 'admin_retry',
            mode: txHash ? 'chain' : 'manual',
            adminId: req.userId,
            ip: req.ip ?? req.socket?.remoteAddress ?? 'admin',
        });
        res.json({ success: true, credited, amountUsd: usdValue });
    }
    catch (err) {
        next(err);
    }
});
// ── BTC wallet config ──────────────────────────────────────────────────────
exports.adminRouter.get('/btc-wallet', async (_req, res, next) => {
    try {
        Promise.resolve().then(async () => {
            const { deriveBtcAddress } = await Promise.resolve().then(() => __importStar(require('../services/btcMonitor')));
            const { decryptSetting, isEncryptedSetting } = await Promise.resolve().then(() => __importStar(require('../lib/encryption')));
            const envXpub = process.env.BTC_XPUB;
            let source = 'none';
            let xpub = null;
            let encrypted = true; // env-sourced keys are never "legacy plain-text in DB"
            if (envXpub) {
                source = 'env';
                xpub = envXpub;
            }
            else {
                const { data } = await Promise.resolve().then(() => __importStar(require('../lib/supabase'))).then(m => m.supabase.from('system_settings').select('value').eq('key', 'btc_xpub').maybeSingle());
                if (data?.value) {
                    source = 'db';
                    encrypted = isEncryptedSetting(data.value);
                    try {
                        xpub = decryptSetting(data.value);
                    }
                    catch (e) {
                        console.error('[BTC] Failed to decrypt stored xpub:', e);
                        return res.status(500).json({ error: 'Stored xpub could not be decrypted — check SETTINGS_ENCRYPTION_KEY' });
                    }
                }
            }
            if (!xpub)
                return res.json({ configured: false, source: 'none' });
            let firstAddress = null;
            let valid = false;
            try {
                // deriveBtcAddress handles both xpub and zpub version bytes
                firstAddress = deriveBtcAddress(xpub, 0);
                valid = true;
            }
            catch { /* invalid */ }
            const isTestnet = xpub.startsWith('tpub') || xpub.startsWith('upub') || xpub.startsWith('vpub');
            res.json({ configured: true, source, valid, firstAddress, isTestnet, encrypted });
        }).catch(next);
    }
    catch (err) {
        next(err);
    }
});
// Preview endpoint — validates format and returns first derived address without saving
exports.adminRouter.post('/btc-wallet/preview', async (req, res, next) => {
    try {
        const { xpub } = zod_1.z.object({ xpub: zod_1.z.string().min(50) }).parse(req.body);
        const { deriveBtcAddress } = await Promise.resolve().then(() => __importStar(require('../services/btcMonitor')));
        try {
            // deriveBtcAddress handles xpub and zpub version bytes natively
            const firstAddress = deriveBtcAddress(xpub, 0);
            const isTestnet = xpub.startsWith('tpub') || xpub.startsWith('upub') || xpub.startsWith('vpub');
            return res.json({ success: true, firstAddress, isTestnet });
        }
        catch {
            return res.status(400).json({ error: 'Invalid xpub format' });
        }
    }
    catch (err) {
        next(err);
    }
});
exports.adminRouter.post('/btc-wallet', async (req, res, next) => {
    try {
        const { xpub } = zod_1.z.object({ xpub: zod_1.z.string().min(50) }).parse(req.body);
        // Validate cryptographically using deriveBtcAddress, which handles xpub and zpub
        const { deriveBtcAddress, clearXpubCache, startBtcMonitor } = await Promise.resolve().then(() => __importStar(require('../services/btcMonitor')));
        let firstAddress;
        try {
            firstAddress = deriveBtcAddress(xpub, 0);
        }
        catch {
            return res.status(400).json({ error: 'Invalid xpub — could not parse the key. Check for typos or extra spaces.' });
        }
        const isTestnet = xpub.startsWith('tpub') || xpub.startsWith('upub') || xpub.startsWith('vpub');
        // Encrypt before storing — the DB should never hold the xpub in plain text.
        const { encryptSetting } = await Promise.resolve().then(() => __importStar(require('../lib/encryption')));
        let encryptedXpub;
        try {
            encryptedXpub = encryptSetting(xpub);
        }
        catch (e) {
            return res.status(503).json({ error: e?.message ?? 'SETTINGS_ENCRYPTION_KEY is not configured — cannot save the xpub securely' });
        }
        // Store in system_settings (upsert)
        const { supabase } = await Promise.resolve().then(() => __importStar(require('../lib/supabase')));
        const { error } = await supabase
            .from('system_settings')
            .upsert({ key: 'btc_xpub', value: encryptedXpub, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error)
            throw error;
        // Clear in-memory xpub cache so the monitor + payments route pick up the new value,
        // then ensure the monitor loop is running (idempotent — safe to call multiple times).
        clearXpubCache();
        startBtcMonitor(); // activates polling if not already running
        // Audit log
        await supabase.from('audit_logs').insert({
            action: 'btc_xpub_updated',
            metadata: JSON.stringify({ firstAddress, isTestnet, source: 'admin_ui' }),
            ip_address: 'admin',
        });
        res.json({ success: true, firstAddress, isTestnet });
    }
    catch (err) {
        next(err);
    }
});
// Health-check endpoint — queries Blockstream for the first derived address
exports.adminRouter.get('/btc-wallet/health-check', async (_req, res, next) => {
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { getXpub, deriveBtcAddress } = await Promise.resolve().then(() => __importStar(require('../services/btcMonitor')));
        const xpub = await getXpub();
        if (!xpub)
            return res.status(400).json({ error: 'No xpub configured' });
        let firstAddress;
        try {
            firstAddress = deriveBtcAddress(xpub, 0);
        }
        catch {
            return res.status(400).json({ error: 'Could not derive address from configured xpub' });
        }
        // Fetch address stats from Blockstream
        const BLOCKSTREAM_API = 'https://blockstream.info/api';
        const { data: addrInfo } = await axios.get(`${BLOCKSTREAM_API}/address/${firstAddress}`, { timeout: 15000 });
        const txCount = addrInfo.chain_stats.tx_count + addrInfo.mempool_stats.tx_count;
        const balanceSat = addrInfo.chain_stats.funded_txo_sum - (addrInfo.chain_stats.spent_txo_count > 0
            ? addrInfo.chain_stats.funded_txo_sum // approximation: treat spent UTXOs as zero balance
            : 0);
        // Use the proper funded - spent calculation
        const fundedSat = addrInfo.chain_stats.funded_txo_sum;
        const spentSat = addrInfo.mempool_stats.funded_txo_sum; // mempool unspent
        const balanceBtc = (addrInfo.chain_stats.funded_txo_sum - addrInfo.chain_stats.spent_txo_count * 0) / 1e8;
        // Simpler: just report raw stats — the client can display them
        res.json({
            success: true,
            address: firstAddress,
            txCount,
            chainTxCount: addrInfo.chain_stats.tx_count,
            mempoolTxCount: addrInfo.mempool_stats.tx_count,
            fundedSat: addrInfo.chain_stats.funded_txo_sum,
            fundedBtc: addrInfo.chain_stats.funded_txo_sum / 1e8,
            hasHistory: txCount > 0,
        });
    }
    catch (err) {
        if (err?.response?.status === 400 || err?.response?.status === 404) {
            return res.status(502).json({ error: 'Blockstream could not find this address — check your xpub.' });
        }
        next(err);
    }
});
exports.adminRouter.delete('/btc-wallet', async (_req, res, next) => {
    try {
        if (process.env.BTC_XPUB) {
            return res.status(409).json({
                error: 'BTC_XPUB is set via environment variable and cannot be removed from the UI. Remove the secret from your deployment settings instead.',
            });
        }
        const { supabase } = await Promise.resolve().then(() => __importStar(require('../lib/supabase')));
        await supabase.from('system_settings').delete().eq('key', 'btc_xpub');
        const { clearXpubCache } = await Promise.resolve().then(() => __importStar(require('../services/btcMonitor')));
        clearXpubCache();
        await supabase.from('audit_logs').insert({
            action: 'btc_xpub_removed',
            metadata: JSON.stringify({ source: 'admin_ui' }),
            ip_address: 'admin',
        });
        res.json({ success: true });
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
