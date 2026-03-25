-- Replace get_tracked_set_progress and update_found_count to use auth.uid()
-- instead of accepting a p_user_id parameter. This prevents any authenticated
-- user from reading/writing another user's data via direct RPC calls.
-- Mirrors the fix already applied to get_owned_part_count in migration
-- 20260316025825_secure_owned_part_count_rpc.sql.

-- =========================================================================
-- 1. get_tracked_set_progress: drop old signature, recreate without p_user_id
-- =========================================================================

DROP FUNCTION IF EXISTS public.get_tracked_set_progress(UUID);

CREATE OR REPLACE FUNCTION public.get_tracked_set_progress()
RETURNS TABLE (
  set_num TEXT,
  found_count BIGINT,
  name TEXT,
  year INTEGER,
  num_parts INTEGER,
  image_url TEXT,
  theme_id INTEGER
) AS $$
  SELECT usp.set_num,
         SUM(usp.owned_quantity)::BIGINT,
         rs.name,
         rs.year,
         rs.num_parts,
         rs.image_url,
         rs.theme_id
  FROM public.user_set_parts usp
  LEFT JOIN public.rb_sets rs ON rs.set_num = usp.set_num
  WHERE usp.user_id = (SELECT auth.uid())
    AND usp.is_spare = false
    AND usp.owned_quantity > 0
  GROUP BY usp.set_num, rs.name, rs.year, rs.num_parts, rs.image_url, rs.theme_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

REVOKE ALL ON FUNCTION public.get_tracked_set_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tracked_set_progress() TO authenticated;

COMMENT ON FUNCTION public.get_tracked_set_progress IS
  'Returns aggregated owned_quantity per set for the authenticated user. '
  'Used to show piece counts on the landing page for sets not yet in user_sets.';

-- =========================================================================
-- 2. update_found_count: drop old signature, recreate without p_user_id
-- =========================================================================

DROP FUNCTION IF EXISTS public.update_found_count(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_found_count(
  p_set_num TEXT
) RETURNS void AS $$
BEGIN
  UPDATE public.user_sets
  SET found_count = COALESCE(
    (
      SELECT SUM(owned_quantity)
      FROM public.user_set_parts
      WHERE user_id = (SELECT auth.uid())
        AND set_num = p_set_num
        AND is_spare = false
        AND owned_quantity > 0
    ),
    0
  )
  WHERE user_id = (SELECT auth.uid())
    AND set_num = p_set_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.update_found_count(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_found_count(TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_found_count IS
  'Atomically recomputes found_count for a user/set from user_set_parts. '
  'Uses auth.uid() to scope to the authenticated user.';
