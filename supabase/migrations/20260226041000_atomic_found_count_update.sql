-- Migration: Atomic found_count update
-- Fixes race condition where concurrent syncs could read stale aggregates
-- and write incorrect found_count values to user_sets.
--
-- Combines the SUM aggregate and UPDATE into a single atomic statement
-- so no concurrent sync can interleave between the read and write.

CREATE OR REPLACE FUNCTION update_found_count(
  p_user_id UUID,
  p_set_num TEXT
) RETURNS void AS $$
BEGIN
  UPDATE public.user_sets
  SET found_count = COALESCE(
    (
      SELECT SUM(owned_quantity)
      FROM public.user_set_parts
      WHERE user_id = p_user_id
        AND set_num = p_set_num
        AND is_spare = false
        AND owned_quantity > 0
    ),
    0
  )
  WHERE user_id = p_user_id
    AND set_num = p_set_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only allow authenticated users (called from server-side route handler)
REVOKE ALL ON FUNCTION update_found_count(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_found_count(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION update_found_count IS
  'Atomically recomputes found_count for a user/set from user_set_parts. '
  'The aggregate and update run in a single statement to prevent stale reads from concurrent syncs.';
