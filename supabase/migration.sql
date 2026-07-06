-- ============================================================
-- ASTRO META-TRADE — Supabase Database Migration
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT UNIQUE NOT NULL,
  full_name        TEXT NOT NULL,
  country          TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email_verified   BOOLEAN DEFAULT FALSE,
  two_fa_secret    TEXT,
  two_fa_enabled   BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Balances ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.balances (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  unified_usd_balance   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Investments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  package_type         TEXT NOT NULL CHECK (package_type IN ('silver', 'gold', 'platinum')),
  amount_usd           NUMERIC(18, 2) NOT NULL,
  start_date           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_return_pct TEXT NOT NULL DEFAULT '0',
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'completed', 'on_hold', 'matured', 'cancelled')),
  manager_name         TEXT DEFAULT 'ASTRO Trading Desk',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'investment')),
  amount_usd   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  method       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'failed')),
  tx_hash      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Deposit Addresses ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deposit_addresses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coin        TEXT NOT NULL,
  chain       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (coin, chain)
);

-- ── 6. Withdrawals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_usd    NUMERIC(18, 2) NOT NULL,
  method        TEXT NOT NULL,
  destination   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at  TIMESTAMPTZ DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

-- ── 7. Audit Logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  metadata     TEXT,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Support Messages ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. Portfolio Updates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_updates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investment_id     UUID NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  previous_balance  NUMERIC(18, 2) NOT NULL,
  new_balance       NUMERIC(18, 2) NOT NULL,
  change_amount     NUMERIC(18, 2) NOT NULL,
  change_pct        TEXT DEFAULT '0',
  note              TEXT,
  updated_by_admin  BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. Admin Messages ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_admin  BOOLEAN DEFAULT TRUE,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_id   ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investments_user_id    ON public.investments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status     ON public.withdrawals (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_updates_user ON public.portfolio_updates (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_messages_user    ON public.admin_messages (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_coin ON public.deposit_addresses (coin, chain, is_active);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER balances_updated_at
  BEFORE UPDATE ON public.balances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create user profile row on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, country)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'country', '')
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.balances (user_id, unified_usd_balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_updates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_addresses  ENABLE ROW LEVEL SECURITY;

-- ── users: users see only their own row; admins see all ─────
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "admins_select_all_users" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── balances ─────────────────────────────────────────────────
CREATE POLICY "balances_select_own" ON public.balances
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admins_select_all_balances" ON public.balances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── investments ───────────────────────────────────────────────
CREATE POLICY "investments_select_own" ON public.investments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admins_all_investments" ON public.investments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── transactions ──────────────────────────────────────────────
CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_all_transactions" ON public.transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── deposit_addresses: all authenticated users can read active ─
CREATE POLICY "deposit_addresses_select_active" ON public.deposit_addresses
  FOR SELECT USING (is_active = TRUE AND auth.role() = 'authenticated');

CREATE POLICY "admins_all_deposit_addresses" ON public.deposit_addresses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── withdrawals ───────────────────────────────────────────────
CREATE POLICY "withdrawals_select_own" ON public.withdrawals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "withdrawals_insert_own" ON public.withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins_all_withdrawals" ON public.withdrawals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── audit_logs ────────────────────────────────────────────────
CREATE POLICY "audit_logs_insert_own" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "admins_select_all_audit" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── support_messages ─────────────────────────────────────────
CREATE POLICY "support_insert" ON public.support_messages
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "admins_all_support" ON public.support_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── portfolio_updates ─────────────────────────────────────────
CREATE POLICY "portfolio_updates_select_own" ON public.portfolio_updates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admins_all_portfolio_updates" ON public.portfolio_updates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ── admin_messages ────────────────────────────────────────────
CREATE POLICY "admin_messages_select_own" ON public.admin_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admin_messages_update_own" ON public.admin_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "admins_all_admin_messages" ON public.admin_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- increment_balance RPC
-- Used by the blockchain listener for atomic, race-safe balance updates.
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS VOID AS $
BEGIN
  UPDATE public.balances
  SET unified_usd_balance = unified_usd_balance + p_amount,
      updated_at          = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance row not found for user %', p_user_id;
  END IF;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SEED: Make first user admin (update email below)
-- ============================================================
-- UPDATE public.users SET role = 'admin' WHERE email = 'admin@yourdomain.com';

-- ============================================================
-- BTC HD-wallet deposit support
-- ============================================================

-- Dedicated column for the BTC deposit address so tx_hash remains
-- exclusively for the on-chain txid (set on confirmation).
-- This prevents the dual-semantics problem where a single bitcoin tx
-- paying multiple addresses would cause unique-constraint collisions.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS btc_address TEXT;

-- Unique partial index on btc_address: prevents two active deposits from
-- sharing the same BTC deposit address. Combined with the route's
-- unique-constraint + retry loop this is concurrency-safe without a sequence.
CREATE UNIQUE INDEX IF NOT EXISTS idx_btc_active_address
  ON public.transactions (btc_address)
  WHERE method = 'btc' AND btc_address IS NOT NULL AND status IN ('pending', 'confirmed');

-- ============================================================
-- DONE ✅
-- ============================================================
