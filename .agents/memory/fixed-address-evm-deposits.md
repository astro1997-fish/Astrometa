---
name: Fixed-address EVM deposit matching
description: How ETH/USDT/USDC deposits are matched to users on a single shared address, replacing the earlier smart-contract flow.
---

ETH/USDT/USDC deposits use one shared admin-managed address per coin (BTC-style), not a smart contract + wallet-connect flow. A fixed address can't distinguish depositors, so each pending deposit is allocated a unique exact required amount that the monitor matches on-chain by raw value.

**Why:** avoids per-user derived EVM addresses or a redeployed/re-audited smart contract while still allowing exact on-chain matching.

**How to apply:**
- Jitter the amount as a raw-integer offset bounded by real USD value (e.g. ~$0.01), not a fixed decimal-string digit — bounding by USD keeps the space huge (thousands to trillions of values) while staying invisible to the user. A jitter scheme with only a handful of possible values will collide under real concurrency even with a DB unique-index retry loop.
- Any manual/admin "verify this tx hash and credit" path must check the on-chain amount against the *specific* deposit's allocated amount, not just "did it pay an active address" — otherwise an admin entering a valid-but-wrong hash can credit the wrong pending record.
- Live-query the deposit address config rather than caching it, so admin changes apply without a backend restart.
