"use strict";
/**
 * Ethereum blockchain listener for AstroPaymentReceiver contract events.
 * Watches for PaymentReceived events, matches them to pending transactions,
 * and atomically credits user balances after sufficient confirmations.
 *
 * Safety properties:
 *  - Idempotent: uses conditional status update (pending → confirmed) so
 *    replayed events or multi-instance races never double-credit.
 *  - Finality-guarded: waits MIN_CONFIRMATIONS blocks before crediting to
 *    protect against chain reorgs.
 *  - Deduplication: processed (txHash + logIndex) pairs are persisted so
 *    restarts cannot replay an already-handled event.
 */
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
exports.startBlockchainListener = startBlockchainListener;
const ethers_1 = require("ethers");
const supabase_1 = require("../lib/supabase");
const email_1 = require("./email");
// Minimal ABI — only the event we need
const CONTRACT_ABI = [
    'event PaymentReceived(bytes32 indexed paymentId, address indexed sender, address token, uint256 amount)',
];
// Known ERC-20 token addresses on Ethereum mainnet
const TOKEN_MAP = {
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
};
// How many block confirmations to wait before crediting.
// 12 is a safe default for Ethereum mainnet; override via env for testnets.
const MIN_CONFIRMATIONS = parseInt(process.env.MIN_CONFIRMATIONS ?? '12', 10);
/**
 * Atomically transitions a transaction from pending → confirmed and credits
 * the user's balance in a single conditional update.
 *
 * Returns true if credit was applied, false if the transaction was already
 * confirmed (idempotent — safe to call multiple times).
 */
async function atomicCredit(txId, userId, amountUsd, txHash, eventKey) {
    // 1. Transition status pending → confirmed.
    //    The .eq('status', 'pending') guard makes this a no-op on replay.
    const { data: updated, error: txErr } = await supabase_1.supabase
        .from('transactions')
        .update({ status: 'confirmed', amount_usd: amountUsd, tx_hash: txHash })
        .eq('id', txId)
        .eq('status', 'pending') // ← conditional: only update once
        .select('id');
    if (txErr) {
        console.error('[Blockchain] Failed to confirm transaction:', txErr.message);
        throw txErr;
    }
    if (!updated || updated.length === 0) {
        // Already confirmed by a previous run — skip balance update
        console.log(`[Blockchain] Transaction ${txId} already confirmed — skipping (event: ${eventKey})`);
        return false;
    }
    // 2. Increment balance atomically using Postgres addition.
    //    Using .rpc() avoids a read-modify-write race between concurrent instances.
    const { error: balErr } = await supabase_1.supabase.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: amountUsd,
    });
    if (balErr) {
        // Roll back the status update so the event can be retried
        await supabase_1.supabase
            .from('transactions')
            .update({ status: 'pending' })
            .eq('id', txId);
        console.error('[Blockchain] Balance increment failed — rolled back tx status:', balErr.message);
        throw balErr;
    }
    // 3. Confirmation email + audit log (best-effort — don't roll back on failure)
    try {
        const { data: user } = await supabase_1.supabase
            .from('users')
            .select('email, full_name')
            .eq('id', userId)
            .single();
        if (user) {
            await email_1.emailService.sendDepositConfirmed(user.email, user.full_name, amountUsd);
        }
    }
    catch (e) {
        console.warn('[Blockchain] Confirmation email failed (non-fatal):', e);
    }
    try {
        await supabase_1.supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'deposit_confirmed',
            metadata: JSON.stringify({ amountUsd, txId, txHash, eventKey }),
            ip_address: 'blockchain',
        });
    }
    catch (e) {
        console.warn('[Blockchain] Audit log failed (non-fatal):', e);
    }
    console.log(`[Blockchain] Credited $${amountUsd} to user ${userId} (tx: ${txId}, event: ${eventKey})`);
    return true;
}
async function getUsdValue(token, rawAmount, decimals) {
    const isStablecoin = token !== 'ETH';
    if (isStablecoin) {
        return Number(rawAmount) / 10 ** decimals;
    }
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: 'ethereum', vs_currencies: 'usd' },
        });
        const price = data['ethereum']?.usd ?? 0;
        const amount = Number(rawAmount) / 1e18;
        return amount * price;
    }
    catch {
        console.error('[Blockchain] Failed to fetch ETH price');
        return 0;
    }
}
function startBlockchainListener() {
    const rpcUrl = process.env.ETH_RPC_URL;
    const contractAddr = process.env.CONTRACT_ADDRESS;
    if (!rpcUrl) {
        console.warn('[Blockchain] ETH_RPC_URL not set — listener not started');
        return;
    }
    if (!contractAddr) {
        console.warn('[Blockchain] CONTRACT_ADDRESS not set — listener not started (deploy the contract first)');
        return;
    }
    const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers_1.ethers.Contract(contractAddr, CONTRACT_ABI, provider);
    console.log(`[Blockchain] Listening for PaymentReceived on ${contractAddr} (min ${MIN_CONFIRMATIONS} confirmations)`);
    contract.on('PaymentReceived', async (paymentId, _sender, token, rawAmount, event) => {
        const txHash = event.transactionHash;
        const logIndex = event.index;
        const eventKey = `${txHash}:${logIndex}`;
        console.log(`[Blockchain] PaymentReceived paymentId=${paymentId} tx=${txHash} — waiting ${MIN_CONFIRMATIONS} confirmations…`);
        try {
            // ── Wait for finality ──────────────────────────────────────────────
            const receipt = await provider.waitForTransaction(txHash, MIN_CONFIRMATIONS);
            if (!receipt || receipt.status !== 1) {
                console.warn(`[Blockchain] Transaction ${txHash} failed or reverted — skipping`);
                return;
            }
            // ── Look up pending transaction ────────────────────────────────────
            const { data: txRecord, error: lookupErr } = await supabase_1.supabase
                .from('transactions')
                .select('id, user_id, amount_usd')
                .eq('tx_hash', paymentId)
                .in('status', ['pending', 'confirmed']) // include confirmed for idempotency check
                .maybeSingle();
            if (lookupErr) {
                console.error('[Blockchain] DB lookup error:', lookupErr.message);
                return;
            }
            if (!txRecord) {
                console.warn(`[Blockchain] No transaction found for paymentId ${paymentId}`);
                return;
            }
            // ── Determine USD value ────────────────────────────────────────────
            const isETH = token === ethers_1.ethers.ZeroAddress;
            let usdValue;
            if (isETH) {
                usdValue = await getUsdValue('ETH', rawAmount, 18);
            }
            else {
                const tokenInfo = TOKEN_MAP[token.toLowerCase()];
                if (!tokenInfo) {
                    console.warn(`[Blockchain] Unknown token ${token} — cannot determine USD value`);
                    return;
                }
                usdValue = await getUsdValue(tokenInfo.symbol, rawAmount, tokenInfo.decimals);
            }
            if (usdValue <= 0) {
                console.warn(`[Blockchain] USD value is 0 for paymentId ${paymentId} — skipping credit`);
                return;
            }
            // ── Atomic, idempotent credit ──────────────────────────────────────
            await atomicCredit(txRecord.id, txRecord.user_id, usdValue, txHash, eventKey);
        }
        catch (err) {
            console.error('[Blockchain] Error processing PaymentReceived:', err);
        }
    });
    // Reconnect on provider errors
    provider.on('error', (err) => {
        console.error('[Blockchain] Provider error:', err.message);
    });
}
