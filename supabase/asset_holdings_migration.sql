-- Asset holdings (multi-asset portfolio breakdown)
-- ============================================================
-- Per-user, per-asset quantity (e.g. 1.78M USDT, 0.0001 BTC). Live USD prices
-- are looked up at read time (CoinGecko, same as the BTC/ETH deposit
-- monitors) rather than stored here, so a row only needs the raw quantity.
-- USD/USDT are treated as $1 pegged; other assets are priced live.
CREATE TABLE IF NOT EXISTS public.asset_holdings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  asset       TEXT NOT NULL CHECK (asset IN ('USD', 'USDT', 'BTC', 'ETH')),
  quantity    NUMERIC(24, 8) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, asset)
);

CREATE INDEX IF NOT EXISTS idx_asset_holdings_user ON public.asset_holdings (user_id);

ALTER TABLE public.asset_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_holdings_select_own" ON public.asset_holdings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admins_all_asset_holdings" ON public.asset_holdings
  FOR ALL USING (public.is_admin());

-- NOTE: created after the blanket service_role GRANT block above — that
-- GRANT only covers tables that existed at the time it ran, so re-declare
-- it explicitly here (see the system_settings note further up).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_holdings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_holdings TO authenticated;
