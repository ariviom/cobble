-- Migration: Add RLS policies for pricing tables (C7)
--
-- bl_price_cache, bl_price_observations, and bp_derived_prices each have
-- ENABLE ROW LEVEL SECURITY but no policies defined. These are internal
-- tables accessed only via service_role. Adding explicit policies documents
-- this access pattern and satisfies the linter.

-- Policy: bl_price_cache (BrickLink price guide cache)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_price_cache;
CREATE POLICY "Service role full access"
  ON public.bl_price_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bl_price_observations (BrickLink price observation history)
DROP POLICY IF EXISTS "Service role full access" ON public.bl_price_observations;
CREATE POLICY "Service role full access"
  ON public.bl_price_observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: bp_derived_prices (Brick Party derived/computed prices)
DROP POLICY IF EXISTS "Service role full access" ON public.bp_derived_prices;
CREATE POLICY "Service role full access"
  ON public.bp_derived_prices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
