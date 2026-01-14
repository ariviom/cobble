-- Migration: Atomic usage counter increment
-- Fixes race condition where concurrent requests can both read the same count
-- and both increment, allowing users to exceed quota limits.

-- Create function for atomic increment with limit check
CREATE OR REPLACE FUNCTION increment_usage_counter(
  p_user_id UUID,
  p_feature_key TEXT,
  p_window_kind TEXT,
  p_window_start TEXT,
  p_limit INT
) RETURNS TABLE (allowed BOOLEAN, new_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Atomic upsert with increment - uses row-level locking to prevent race conditions
  INSERT INTO usage_counters (user_id, feature_key, window_kind, window_start, count, updated_at)
  VALUES (p_user_id, p_feature_key, p_window_kind, p_window_start, 1, NOW())
  ON CONFLICT (user_id, feature_key, window_kind, window_start)
  DO UPDATE SET
    count = usage_counters.count + 1,
    updated_at = NOW()
  RETURNING usage_counters.count INTO v_count;

  -- Return whether the operation was within limits and the new count
  -- If new_count > limit, caller should handle the overage (count was still incremented)
  RETURN QUERY SELECT (v_count <= p_limit), v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role only (called from server-side code)
REVOKE ALL ON FUNCTION increment_usage_counter(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_usage_counter(UUID, TEXT, TEXT, TEXT, INT) TO service_role;

COMMENT ON FUNCTION increment_usage_counter IS
  'Atomically increments a usage counter and checks against limit. Returns (allowed, new_count). '
  'The increment always happens - if allowed is false, the count exceeded the limit.';
