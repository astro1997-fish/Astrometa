---
name: Supabase migration.sql grant ordering pitfall
description: Why a table can exist with correct RLS policies yet still throw "permission denied for table X" for service_role, and how to avoid it in migration.sql.
---

`supabase/migration.sql` has one blanket `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` block partway through the file. Postgres `GRANT ... ALL TABLES` only covers tables that already exist at the moment it runs — it is not retroactive and not a standing policy like `ALTER DEFAULT PRIVILEGES`.

**Why:** Any `CREATE TABLE` appearing *after* that blanket grant line in the file (e.g. `system_settings`, added later for xpub/price-cache persistence) is silently missing the grant. Enabling RLS and adding a policy does not fix this — RLS and GRANT are two independent layers; `service_role` bypasses RLS but still needs the underlying table-level GRANT to avoid `permission denied for table X` (Postgres error 42501) at the PostgREST layer. This surfaces even though the *code* looks identical to other working system_settings reads/writes.

**How to apply:** When adding a new table to `migration.sql` after the blanket grant block, add an explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO service_role, authenticated;` right next to that table's own `CREATE TABLE`/RLS policy, rather than relying on the earlier blanket grant. If a "permission denied for table" error appears despite correct-looking RLS policies, check grant order in migration.sql before debugging application code — verify by querying the table directly via the Supabase REST endpoint with the service role key; the error only appears at the DB grant layer, not in TypeScript.
