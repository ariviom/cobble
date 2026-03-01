-- Fix Supabase linter warnings:
-- 1. function_search_path_mutable: set search_path on 3 functions
-- 2. materialized_view_in_api: revoke anon/authenticated access on 2 mat views

-- =========================================================================
-- 1. Fix mutable search_path on functions
-- =========================================================================

-- update_found_count: already uses public-qualified table names
CREATE OR REPLACE FUNCTION public.update_found_count(
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- increment_system_counter: add public. prefix to system_counters
CREATE OR REPLACE FUNCTION public.increment_system_counter(
  p_key          text,
  p_window_start date,
  p_limit        int
) RETURNS TABLE (allowed boolean, new_count int) AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO public.system_counters (counter_key, window_start, count, updated_at)
  VALUES (p_key, p_window_start, 1, now())
  ON CONFLICT (counter_key, window_start)
  DO UPDATE SET
    count      = public.system_counters.count + 1,
    updated_at = now()
  RETURNING public.system_counters.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- get_system_counter: add public. prefix to system_counters
CREATE OR REPLACE FUNCTION public.get_system_counter(
  p_key          text,
  p_window_start date
) RETURNS int AS $$
  SELECT coalesce(
    (SELECT count FROM public.system_counters
     WHERE counter_key = p_key AND window_start = p_window_start),
    0
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '';

-- =========================================================================
-- 2. Revoke materialized view access from PostgREST-exposed roles
-- =========================================================================
-- These views are only consumed by SECURITY DEFINER functions
-- (get_user_total_pieces, get_missing_parts), not queried directly via API.

REVOKE SELECT ON public.mv_set_parts FROM anon, authenticated;
REVOKE SELECT ON public.mv_set_non_spare_count FROM anon, authenticated;
