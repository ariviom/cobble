-- Add missing RLS policy for bl_set_minifigs.
-- The table was dropped in 20260215165608 and recreated in 20260220022950
-- with RLS enabled but no policies, which blocks all access including
-- service_role via PostgREST.

CREATE POLICY "Service role full access"
  ON public.bl_set_minifigs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
