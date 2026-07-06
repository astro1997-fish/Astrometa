---
name: Crypto deposit on-chain design
description: How crypto deposits work — smart contract, listener, atomic credit, and what's needed to go live.
---

## Design
The app uses a custom `AstroPaymentReceiver` Ethereum contract (not a third-party gateway). The backend blockchain listener (`blockchainListener.ts`) watches for `PaymentReceived` events.

## Activation requirement
Two env vars must be set before crypto deposits work:
- `ETH_RPC_URL` — already set as a Replit secret
- `CONTRACT_ADDRESS` — needs the deployed contract address (Task #2)

## Safety properties (enforced in blockchainListener.ts)
- **Idempotent**: conditional update `.eq('status', 'pending')` prevents double-credit on event replay
- **Finality guard**: `provider.waitForTransaction(txHash, MIN_CONFIRMATIONS)` — defaults to 12 blocks, overridable via `MIN_CONFIRMATIONS` env var
- **Atomic balance increment**: uses Supabase RPC `increment_balance` (Postgres addition, not read-modify-write)
- **Rollback on balance failure**: if balance increment fails, transaction status is rolled back to pending so it can be retried

## increment_balance RPC
Added to `supabase/migration.sql`. Must be run in Supabase SQL Editor if not already present.

**Why:** Plain read-modify-write on balances is a race condition under concurrent instances or event replays; a Postgres-side addition is atomic.

## Frontend UX (FundAccount.tsx)
- QR code shows Payment ID (not contract address) — plain sends to contract revert or strand tokens
- Red warning banner: users MUST use the "Pay with Wallet" MetaMask button
- Manual send instructions removed (they were dangerous for ERC-20)
- Supports ETH, USDT, USDC
