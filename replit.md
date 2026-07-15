# ASTRO META-TRADE

## Overview
A crypto/fiat investment platform. Users fund their account via BTC, ETH, USDT, USDC, or fiat (Stripe/Paystack/PayPal), invest in managed packages, and track balances/portfolio performance. Admins manage users, deposits, withdrawals, listener health, and platform settings.

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Express + TypeScript (`backend/`)
- **Database/Auth:** Supabase (Postgres + RLS). Schema lives in `supabase/migration.sql` — the agent has no direct DDL access, so any schema change requires the user to run the updated file manually in the Supabase SQL editor.
- **Crypto deposits:**
  - BTC: HD-wallet address derived per deposit (BIP32 xpub), monitored via `backend/src/services/btcMonitor.ts`.
  - ETH/USDT/USDC: fixed shared admin-managed address per coin (same UX as BTC), with a unique jittered required amount per deposit for on-chain matching. Monitored via `backend/src/services/blockchainListener.ts`. Managed from the admin "Deposit Addresses" page.

## User preferences
(none recorded yet)
