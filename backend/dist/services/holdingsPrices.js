"use strict";
// Live USD pricing for the multi-asset holdings breakdown (Portfolio page).
// Kept separate from btcMonitor.ts / blockchainListener.ts — those caches
// exist to price *deposits* and must never be perturbed by an unrelated
// dashboard read. This is a small, independently-cached CoinGecko lookup
// that also returns the 24h % change the UI displays next to each asset.
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
exports.getLiveAssetPrices = getLiveAssetPrices;
let cache = null;
const CACHE_TTL_MS = 60000;
const COINGECKO_IDS = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
};
/**
 * Returns USD price + 24h % change for BTC and ETH (USD/USDT are pegged at
 * $1 and handled by the caller). Falls back to the last successful fetch if
 * CoinGecko is unreachable; returns an empty object only if no fetch has
 * ever succeeded.
 */
async function getLiveAssetPrices() {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.data;
    }
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: Object.values(COINGECKO_IDS).join(','),
                vs_currencies: 'usd',
                include_24hr_change: 'true',
            },
            timeout: 10000,
        });
        const result = {};
        for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
            const entry = data[id];
            if (entry?.usd > 0) {
                result[symbol] = { usd: entry.usd, usd_24h_change: entry.usd_24h_change ?? 0 };
            }
        }
        if (Object.keys(result).length > 0) {
            cache = { data: result, fetchedAt: now };
            return result;
        }
    }
    catch (err) {
        console.warn('[Holdings] CoinGecko price fetch failed:', err.message);
    }
    // Fall back to the last good snapshot (any age) rather than showing $0.
    return cache?.data ?? {};
}
