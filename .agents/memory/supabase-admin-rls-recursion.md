---
name: Supabase admin RLS recursion
description: Why "infinite recursion detected in policy" breaks all Supabase REST calls, and the SECURITY DEFINER fix pattern.
---

An RLS policy on table `X` that checks admin role via `EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')` — when `X` IS `public.users` itself — re-triggers `users`' own RLS while evaluating that same policy, so Postgres rejects it as infinite recursion (`42P17`).

**Why it matters more than it looks:** this doesn't just break admin-only queries — it breaks *every* authenticated REST call to *every* table that has this pattern (since Postgres errors the whole query), producing app-wide 500s that look like unrelated frontend bugs (stuck UI, "couldn't load" errors, etc.) with no informative client-side error.

**How to apply:** create a `SECURITY DEFINER` helper function (e.g. `public.is_admin()`) that runs with the function owner's privileges and therefore bypasses RLS internally, breaking the recursion. Pin `search_path`, mark `STABLE`, and `REVOKE EXECUTE FROM PUBLIC` + grant only to `authenticated`/`service_role`. Replace every recursive `EXISTS (...FROM public.users...)` policy check with a call to this function.

**Operational note:** if the project's Supabase DB is only reachable via REST (no direct Postgres connection string), the agent cannot execute DDL — provide the exact SQL for the user to run in the Supabase SQL Editor. Multi-statement scripts pasted into that editor run as one transaction, so a single failing statement (e.g. referencing a table that doesn't exist yet) rolls back the entire script silently.
