---
name: settings-encryption
description: How admin-configured secrets (e.g. BTC xpub) are encrypted at rest in system_settings, and the legacy plain-text migration path.
---

Sensitive values stored in the `system_settings` key-value table (e.g. `btc_xpub`) are encrypted at rest with AES-256-GCM, keyed by a server-side encryption secret.

**Why:** the xpub is view-only but leaking it lets anyone derive all deposit addresses and surveil user deposits on-chain; encrypting at rest limits blast radius if the DB is ever read by an unauthorized party.

**How to apply:** encrypted values carry a distinguishing prefix so legacy plain-text rows (written before this change) are auto-detected and still readable via passthrough. Legacy rows are NOT auto-migrated; an admin must re-save the value once via its admin UI after the encryption key is configured, which always writes the encrypted form. Any new admin-managed secret stored in `system_settings` should follow the same encrypt-on-write / decrypt-with-legacy-passthrough pattern rather than inventing a new scheme.
