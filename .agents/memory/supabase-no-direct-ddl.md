---
name: No direct Supabase DDL access
description: Why the agent cannot apply schema changes itself in this project, and what to do instead.
---

This project's backend talks to an external Supabase project via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (PostgREST REST API), not Replit's built-in Postgres. There is no `DATABASE_URL`/`PGHOST` credential for Supabase's actual Postgres instance, and the project defines no `exec_sql`-style RPC function.

**Why:** PostgREST only exposes table/RPC operations, not arbitrary SQL execution — there is no code path available to the agent that can run `ALTER TABLE`/`CREATE TABLE` against this Supabase database. The `database` skill's `executeSql` targets Replit's own managed database, which this project does not use.

**How to apply:** When a task requires a schema change (new column/table/constraint), edit `supabase/migration.sql` (the source of truth, run manually via Supabase Dashboard → SQL Editor per its header comment) and update the application code that depends on the new schema. Verify the column doesn't exist yet with a REST probe if needed (e.g. `curl "$SUPABASE_URL/rest/v1/<table>?select=<col>&limit=1"` with the service role key — a `42703` error confirms it's missing). Tell the user they must run the updated migration.sql in the Supabase SQL editor before the feature will work — do not claim the migration was "applied."
