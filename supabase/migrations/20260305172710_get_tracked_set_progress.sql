-- Migration: get_tracked_set_progress RPC
-- Returns aggregated piece counts for ALL sets with tracked parts,
-- not just sets in user_sets. This powers the landing page so sets
-- worked on from other devices show correct piece counts immediately.

CREATE OR REPLACE FUNCTION public.get_tracked_set_progress(p_user_id UUID)
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
  WHERE usp.user_id = p_user_id
    AND usp.is_spare = false
    AND usp.owned_quantity > 0
  GROUP BY usp.set_num, rs.name, rs.year, rs.num_parts, rs.image_url, rs.theme_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

REVOKE ALL ON FUNCTION public.get_tracked_set_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tracked_set_progress(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_tracked_set_progress IS
  'Returns aggregated owned_quantity per set for all sets with tracked parts. '
  'Used to show piece counts on the landing page for sets not yet in user_sets.';
