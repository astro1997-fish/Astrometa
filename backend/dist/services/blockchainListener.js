"use strict";
/**
 * Ethereum blockchain listener for AstroPaymentReceiver contract events.
 * Watches for PaymentReceived events, matches them to pending transactions,
 * and calls creditUser() to update balances automatically.
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
async function creditUser(userId, amountUsd, txId, txHash) {
    // 1. Credit balance
    const { data: bal } = await supabase_1.supabase
        .from('balances')
        .select('unified_usd_balance')
        .eq('user_id', userId)
        .single();
    const newBalance = (bal?.unified_usd_balance ?? 0) + amountUsd;
    await supabase_1.supabase
        .from('balances')
        .update({ unified_usd_balance: newBalance })
        .eq('user_id', userId);
    // 2. Confirm transaction with on-chain tx hash
    await supabase_1.supabase
        .from('transactions')
        .update({ status: 'confirmed', amount_usd: amountUsd, tx_hash: txHash })
        .eq('id', txId);
    // 3. Send confirmation email
    const { data: user } = await supabase_1.supabase
        .from('users')
        .select('email, full_name')
        .eq('id', userId)
        .single();
    if (user) {
        await email_1.emailService.sendDepositConfirmed(user.email, user.full_name, amountUsd);
    }
    // 4. Audit log
    await supabase_1.supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'deposit_confirmed',
        metadata: JSON.stringify({ amountUsd, txId, txHash }),
        ip_address: 'blockchain',
    });
    console.log(`[Blockchain] Credited $${amountUsd} to user ${userId} (tx: ${txId})`);
}
async function getUsdValue(token, rawAmount, decimals) {
    // Fetch live USD price from CoinGecko
    const id = token === 'ETH' ? 'ethereum' : 'tether'; // USDC/USDT ≈ $1
    const isStablecoin = token !== 'ETH';
    if (isStablecoin) {
        return Number(rawAmount) / 10 ** decimals;
    }
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: id, vs_currencies: 'usd' },
        });
        const price = data[id]?.usd ?? 0;
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
    console.log(`[Blockchain] Listening for PaymentReceived on ${contractAddr}`);
    contract.on('PaymentReceived', async (paymentId, _sender, token, rawAmount, event) => {
        const txHash = event.transactionHash;
        console.log(`[Blockchain] PaymentReceived paymentId=${paymentId} tx=${txHash}`);
        try {
            // Look up the pending transaction by payment_id stored in tx_hash column
            const { data: txRecord } = await supabase_1.supabase
                .from('transactions')
                .select('id, user_id, amount_usd')
                .eq('tx_hash', paymentId)
                .eq('status', 'pending')
                .maybeSingle();
            if (!txRecord) {
                console.warn(`[Blockchain] No pending tx found for paymentId ${paymentId}`);
                return;
            }
            // Determine token symbol and USD value
            const isETH = token === ethers_1.ethers.ZeroAddress;
            let usdValue;
            if (isETH) {
                usdValue = await getUsdValue('ETH', rawAmount, 18);
            }
            else {
                const tokenInfo = TOKEN_MAP[token.toLowerCase()];
                if (!tokenInfo) {
                    console.warn(`[Blockchain] Unknown token ${token}`);
                    return;
                }
                usdValue = await getUsdValue(tokenInfo.symbol, rawAmount, tokenInfo.decimals);
            }
            if (usdValue <= 0) {
                console.warn(`[Blockchain] Could not determine USD value for paymentId ${paymentId}`);
                return;
            }
            await creditUser(txRecord.user_id, usdValue, txRecord.id, txHash);
        }
        catch (err) {
            console.error('[Blockchain] Error processing PaymentReceived:', err);
        }
    });
    // Handle provider disconnections — reconnect after 30s
    provider.on('error', (err) => {
        console.error('[Blockchain] Provider error:', err.message);
    });
}
