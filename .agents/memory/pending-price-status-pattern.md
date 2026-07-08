---
name: pending_price deposit status pattern
description: How the app represents "confirmed on-chain but price feed unavailable" deposits across coins, and where the UI already renders it generically.
---

The `transactions.status` check constraint includes `pending_price` alongside `pending` / `confirmed` / `failed` (added originally for ETH). It means: the on-chain transfer is confirmed, but the USD price feed was down at confirmation time, so crediting is deferred.

**Why:** Originally built for ETH in `blockchainListener.ts` (price-cache resilience + a 5-min retry loop that re-prices and credits `pending_price` rows). When BTC needed the same resilience, the status was reused rather than adding a BTC-specific status — `frontend/src/pages/dashboard/FundAccount.tsx`'s `StatusBadge`/`depositRowStatus` already render `pending_price` generically ("Awaiting price") for any `method`, so no frontend changes were needed there for BTC.

**How to apply:** When adding "confirmed but unpriced" handling for any new coin/method:
- Reuse the `pending_price` status; don't add a new enum value.
- Store what's needed to re-credit later (raw amount, txid/hash) in the `metadata` TEXT column as JSON — see `atomicCredit`/`atomicCreditBtc` credit functions for the `fromStatuses` guard pattern (`.in('status', ['pending', 'pending_price'])`) that makes crediting idempotent and safe to retry.
- `frontend/src/pages/dashboard/Transactions.tsx` (the full transaction history table) needed an explicit `pending_price` branch added to its own local `statusBadge` — it does not share code with `FundAccount.tsx`'s badge, so new statuses must be added there separately if they should render distinctly.
