-- Schema cleanup: security fixes, performance fixes, dead code removal
--
-- Security fixes:
--   1. increment_usage_counter: add SET search_path = public
--   2. bricklink_categories + trigger function: dropped (dead code)
--   3. group_session_participants UPDATE policy: documented as intentional
--   4. Leaked password protection: dashboard-only setting (not addressable in SQL)
--
-- Performance fix:
--   5. user_recent_sets: wrap auth.uid() in (SELECT ...) for all 4 RLS policies
--
-- Dead code cleanup:
--   6. Drop part_id_mappings (replaced by rb_parts.bl_part_id)
--   7. Drop user_parts_inventory (created but never used by app code)
--   8. Drop bricklink_categories + trigger + trigger function

-- ============================================================================
-- 1. Fix increment_usage_counter search_path (preserve identical body)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_usage_counter(
  p_user_id UUID,
  p_feature_key TEXT,
  p_window_kind TEXT,
  p_window_start TEXT,
  p_limit INT
) RETURNS TABLE (allowed BOOLEAN, new_count INT)
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO usage_counters (user_id, feature_key, window_kind, window_start, count, updated_at)
  VALUES (p_user_id, p_feature_key, p_window_kind, p_window_start, 1, NOW())
  ON CONFLICT (user_id, feature_key, window_kind, window_start)
  DO UPDATE SET
    count = usage_counters.count + 1,
    updated_at = NOW()
  RETURNING usage_counters.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply grants (CREATE OR REPLACE resets them)
REVOKE ALL ON FUNCTION increment_usage_counter(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_usage_counter(UUID, TEXT, TEXT, TEXT, INT) TO service_role;

-- ============================================================================
-- 2. Document group_session_participants UPDATE policy as intentional
-- ============================================================================

COMMENT ON POLICY "Public update group session participants"
  ON public.group_session_participants
  IS 'Intentionally always-true: anonymous participants need to update heartbeats (last_seen_at) and rejoin without auth. Access is scoped by the opaque session slug.';

-- ============================================================================
-- 3. Fix user_recent_sets RLS performance: (SELECT auth.uid()) pattern
-- ============================================================================

DROP POLICY IF EXISTS "Select own" ON public.user_recent_sets;
DROP POLICY IF EXISTS "Insert own" ON public.user_recent_sets;
DROP POLICY IF EXISTS "Update own" ON public.user_recent_sets;
DROP POLICY IF EXISTS "Delete own" ON public.user_recent_sets;

CREATE POLICY "Select own" ON public.user_recent_sets
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Insert own" ON public.user_recent_sets
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Update own" ON public.user_recent_sets
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Delete own" ON public.user_recent_sets
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- 4. Drop dead table: part_id_mappings
-- ============================================================================

DROP TABLE IF EXISTS public.part_id_mappings CASCADE;

-- ============================================================================
-- 5. Drop dead table: user_parts_inventory
-- ============================================================================

DROP TABLE IF EXISTS public.user_parts_inventory CASCADE;

-- ============================================================================
-- 6. Drop dead table: bricklink_categories + trigger function
-- ============================================================================

DROP TABLE IF EXISTS public.bricklink_categories CASCADE;
DROP FUNCTION IF EXISTS public.update_bricklink_categories_updated_at();
