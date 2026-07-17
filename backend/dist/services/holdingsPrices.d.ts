interface PriceEntry {
    usd: number;
    usd_24h_change: number;
}
/**
 * Returns USD price + 24h % change for BTC and ETH (USD/USDT are pegged at
 * $1 and handled by the caller). Falls back to the last successful fetch if
 * CoinGecko is unreachable; returns an empty object only if no fetch has
 * ever succeeded.
 */
export declare function getLiveAssetPrices(): Promise<Record<string, PriceEntry>>;
export {};
