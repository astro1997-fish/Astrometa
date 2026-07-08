---
name: Supabase signup email sender
description: Why account-creation emails might show "Supabase Auth" as sender instead of the app's brand, and how this codebase avoids it.
---

Supabase's default GoTrue "Confirm your email" template is sent (branded "Supabase Auth") whenever a user is created via `supabase.auth.signUp()` client-side, or via `admin.createUser()` **without** `email_confirm: true`. It is only reliably suppressed when the backend calls `supabase.auth.admin.createUser({ email_confirm: true, ... })` directly.

**Why:** if any signup path (even indirectly, e.g. a stale deployed build) still uses `auth.signUp()`, Supabase's own SMTP sends the confirmation email with its own sender/branding, bypassing whatever custom-branded welcome email the app sends via its own mailer (e.g. nodemailer).

**How to apply:** when a user reports a Supabase-branded email during signup, first check whether the *deployed* build matches current source — this exact bug was previously fixed in dev (switching to `admin.createUser` + a custom nodemailer welcome email) but the live Replit deployment was still serving an older build that called `auth.signUp()`. Confirm via `git log` on the auth route/context files, then have the user republish. Also verify SMTP credentials aren't placeholders (`your-email@gmail.com` etc.) — Gmail requires a 16-char App Password from an account with 2-Step Verification, not the account's normal password.
