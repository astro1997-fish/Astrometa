"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../lib/supabase");
const btcMonitor_1 = require("../services/btcMonitor");
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
});
const SessionSchema = zod_1.z.object({
    provider: zod_1.z.enum(['stripe', 'paystack', 'paypal']),
    amount: zod_1.z.number().min(100),
    packageType: zod_1.z.string().optional(),
});
// POST /api/payments/create-session  (fiat)
router.post('/create-session', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { provider, amount, packageType } = SessionSchema.parse(req.body);
        const userId = req.userId;
        const frontendUrl = process.env.FRONTEND_URL;
        const { data: txRecord } = await supabase_1.supabase
            .from('transactions')
            .insert({
            user_id: userId,
            type: 'deposit',
            amount_usd: amount,
            method: provider,
            status: 'pending',
        })
            .select('id')
            .single();
        const txId = txRecord?.id;
        if (provider === 'stripe') {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                        price_data: {
                            currency: 'usd',
                            product_data: { name: `ASTRO META-TRADE Deposit${packageType ? ` — ${packageType} Package` : ''}` },
                            unit_amount: Math.round(amount * 100),
                        },
                        quantity: 1,
                    }],
                mode: 'payment',
                success_url: `${frontendUrl}/dashboard/fund?success=1&txId=${txId}`,
                cancel_url: `${frontendUrl}/dashboard/fund?cancelled=1`,
                metadata: { userId, txId: txId ?? '', packageType: packageType ?? '' },
            });
            return res.json({ url: session.url });
        }
        if (provider === 'paystack') {
            const { data: user } = await supabase_1.supabase.from('users').select('email').eq('id', userId).single();
            const { data } = await axios_1.default.post('https://api.paystack.co/transaction/initialize', {
                email: user?.email,
                amount: Math.round(amount * 100),
                currency: 'USD',
                callback_url: `${frontendUrl}/dashboard/fund?success=1&txId=${txId}`,
                metadata: { userId, txId, packageType },
            }, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
            return res.json({ url: data.data.authorization_url });
        }
        if (provider === 'paypal') {
            const tokenRes = await axios_1.default.post('https://api-m.sandbox.paypal.com/v1/oauth2/token', 'grant_type=client_credentials', {
                auth: {
                    username: process.env.PAYPAL_CLIENT_ID,
                    password: process.env.PAYPAL_SECRET,
                },
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            const accessToken = tokenRes.data.access_token;
            const orderRes = await axios_1.default.post('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
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
            }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
            const approveLink = orderRes.data.links?.find((l) => l.rel === 'approve')?.href;
            return res.json({ url: approveLink });
        }
        res.status(400).json({ error: 'Unknown payment provider' });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/payments/capabilities — which coins are currently active
router.get('/capabilities', async (_req, res, next) => {
    try {
        const xpub = await (0, btcMonitor_1.getXpub)();
        res.json({
            btc: !!xpub,
            eth: !!process.env.CONTRACT_ADDRESS,
            usdt: !!process.env.CONTRACT_ADDRESS,
            usdc: !!process.env.CONTRACT_ADDRESS,
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/payments/crypto-rate?coin=ethereum
router.get('/crypto-rate', async (req, res, next) => {
    try {
        const coin = req.query.coin ?? 'ethereum';
        const { data } = await axios_1.default.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: coin, vs_currencies: 'usd' },
        });
        res.json({ coin, usd: data[coin]?.usd ?? null });
    }
    catch (err) {
        next(err);
    }
});
const CryptoDepositSchema = zod_1.z.object({
    coin: zod_1.z.enum(['eth', 'usdt', 'usdc', 'btc']),
    amountUsd: zod_1.z.number().min(10),
});
// Token addresses on Ethereum mainnet
const TOKEN_ADDRESSES = {
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};
// POST /api/payments/create-crypto-deposit
router.post('/create-crypto-deposit', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { coin, amountUsd } = CryptoDepositSchema.parse(req.body);
        const userId = req.userId;
        // ── BTC: HD-wallet address derivation ─────────────────────────────────
        if (coin === 'btc') {
            const xpub = await (0, btcMonitor_1.getXpub)();
            if (!xpub) {
                return res.status(503).json({ error: 'BTC deposits are not yet active. Please contact support.' });
            }
            // Fetch base index (total BTC txs ever — used as the starting point for derivation)
            const { count: baseCount, error: countErr } = await supabase_1.supabase
                .from('transactions')
                .select('id', { count: 'exact', head: true })
                .eq('method', 'btc');
            if (countErr) {
                console.error('[BTC] Failed to count existing BTC transactions:', countErr.message);
                return res.status(500).json({ error: 'Failed to generate BTC address. Please try again.' });
            }
            // Fetch live BTC price (parallel, non-blocking)
            let cryptoAmount = null;
            try {
                const { data } = await axios_1.default.get('https://api.coingecko.com/api/v3/simple/price', {
                    params: { ids: 'bitcoin', vs_currencies: 'usd' },
                });
                const btcPrice = data['bitcoin']?.usd ?? 0;
                if (btcPrice > 0)
                    cryptoAmount = (amountUsd / btcPrice).toFixed(8);
            }
            catch {
                // non-fatal — frontend shows USD amount as fallback
            }
            // ── Atomic address allocation via unique-constraint + retry ───────────
            // The DB has a partial unique index on tx_hash WHERE method='btc' AND
            // status IN ('pending','confirmed'). If two concurrent requests derive
            // the same address (same baseCount), only one INSERT succeeds; the
            // other gets a 23505 unique-violation and retries with the next index.
            let btcAddress = null;
            let txRecord = null;
            const startIndex = baseCount ?? 0;
            for (let attempt = 0; attempt < 10; attempt++) {
                const derivationIndex = startIndex + attempt;
                let candidateAddress;
                try {
                    candidateAddress = (0, btcMonitor_1.deriveBtcAddress)(xpub, derivationIndex);
                }
                catch (e) {
                    console.error('[BTC] Address derivation failed:', e);
                    return res.status(500).json({ error: 'Failed to generate BTC address. Please try again.' });
                }
                const { data, error: insertErr } = await supabase_1.supabase
                    .from('transactions')
                    .insert({
                    user_id: userId,
                    type: 'deposit',
                    amount_usd: amountUsd,
                    method: 'btc',
                    status: 'pending',
                    btc_address: candidateAddress,
                    // tx_hash intentionally left null — set to the on-chain txid on confirmation
                })
                    .select('id')
                    .single();
                if (!insertErr) {
                    btcAddress = candidateAddress;
                    txRecord = data;
                    break;
                }
                // Unique constraint violation — address already in use; try next index
                if (insertErr.code === '23505') {
                    console.warn(`[BTC] Address collision at index ${derivationIndex} — retrying (attempt ${attempt + 1})`);
                    continue;
                }
                // Unexpected DB error
                console.error('[BTC] Failed to insert BTC deposit:', insertErr.message);
                return res.status(500).json({ error: 'Failed to create deposit. Please try again.' });
            }
            if (!btcAddress || !txRecord) {
                console.error('[BTC] Exhausted retry attempts for unique address allocation');
                return res.status(500).json({ error: 'Failed to allocate unique BTC address. Please try again.' });
            }
            await supabase_1.supabase.from('audit_logs').insert({
                user_id: userId,
                action: 'crypto_deposit_initiated',
                metadata: JSON.stringify({ coin: 'btc', amountUsd, btcAddress }),
                ip_address: req.ip,
            });
            return res.json({
                txId: txRecord?.id,
                paymentId: btcAddress, // reuse paymentId field for display
                btcAddress,
                coin: 'btc',
                amountUsd,
                cryptoAmount,
                contractAddress: null,
                tokenAddress: null,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 h window for BTC
            });
        }
        // ── ETH / ERC-20 ──────────────────────────────────────────────────────
        const contractAddress = process.env.CONTRACT_ADDRESS;
        if (!contractAddress) {
            return res.status(503).json({
                error: 'Crypto deposits are not yet active. Please contact support.',
            });
        }
        // Generate a unique payment ID as a 32-byte hex string (bytes32 in Solidity)
        const paymentIdHex = '0x' + (0, crypto_1.randomBytes)(32).toString('hex');
        // Fetch live ETH price if needed
        let cryptoAmount = null;
        if (coin === 'eth') {
            try {
                const { data } = await axios_1.default.get('https://api.coingecko.com/api/v3/simple/price', {
                    params: { ids: 'ethereum', vs_currencies: 'usd' },
                });
                const ethPrice = data.ethereum?.usd ?? 0;
                if (ethPrice > 0) {
                    cryptoAmount = (amountUsd / ethPrice).toFixed(6);
                }
            }
            catch {
                // non-fatal — frontend can still show USD amount
            }
        }
        else {
            // USDT/USDC are stablecoins — 1:1 with USD (6 decimals)
            cryptoAmount = amountUsd.toFixed(2);
        }
        // Insert pending transaction — store paymentId in tx_hash so the listener can match it
        const { data: txRecord } = await supabase_1.supabase
            .from('transactions')
            .insert({
            user_id: userId,
            type: 'deposit',
            amount_usd: amountUsd,
            method: coin,
            status: 'pending',
            tx_hash: paymentIdHex,
        })
            .select('id')
            .single();
        // Audit log
        await supabase_1.supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'crypto_deposit_initiated',
            metadata: JSON.stringify({ coin, amountUsd, paymentId: paymentIdHex }),
            ip_address: req.ip,
        });
        res.json({
            txId: txRecord?.id,
            paymentId: paymentIdHex,
            contractAddress,
            coin,
            amountUsd,
            cryptoAmount,
            tokenAddress: TOKEN_ADDRESSES[coin] ?? null, // null for ETH
            expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
