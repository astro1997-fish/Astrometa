---
name: Multi-asset portfolio holdings
description: How the per-asset (USDT/USD/BTC/ETH) portfolio breakdown is modeled, separate from the unified USD balance.
---

Added `public.asset_holdings` (user_id, asset, quantity) as a supplementary breakdown layer alongside the existing `balances.unified_usd_balance` — the unified balance was kept as-is (other parts of the app depend on it) rather than making it derived from holdings.

USD/USDT are treated as $1-pegged; BTC/ETH prices (and BTC's 24h % change) are fetched live from CoinGecko at read time in `backend/src/services/holdingsPrices.ts`, with their own independent 60s cache — deliberately kept separate from `btcMonitor.ts`/`blockchainListener.ts`'s price caches, which exist to price real deposits and must not be touched by an unrelated dashboard read.

**Why:** avoids a second source of truth for the total balance and avoids coupling a cosmetic dashboard feature to deposit-critical pricing code.

**How to apply:** exposed via `GET /api/portfolio/holdings` (computes price/value/24h from live `asset_holdings` rows). Admins edit quantities per-asset in `AdminPortfolio.tsx` via direct Supabase upsert (RLS `admins_all_asset_holdings` policy), same pattern as other admin edits in that file.
