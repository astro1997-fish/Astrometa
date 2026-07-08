---
name: Health endpoint as shared status source
description: The backend /health route aggregates multiple subsystem statuses (blockchain listener, ETH price feed) for admin dashboard consumption.
---

The `/health` endpoint in `backend/src/index.ts` returns a JSON object with one key per monitored subsystem (e.g. `listener`, `ethPrice`), each populated by a dedicated status-getter function in the relevant service module (e.g. `getListenerStatus()`, `getEthPriceStatus()` in `backend/src/services/blockchainListener.ts`).

**Why:** Keeping all admin-facing health/freshness signals behind one endpoint means the frontend only needs one poll loop, and adding a new subsystem's status is a one-line addition to the response rather than a new route + new frontend fetch.

**How to apply:** When adding a new "is X healthy/fresh" signal for the admin dashboard, add a status-getter to the owning service and merge its result into `/health`'s response rather than creating a parallel endpoint. Frontend admin pages that need this data should fetch `/health` (not add their own bespoke status route).
