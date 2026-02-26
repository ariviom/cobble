-- Migration: Fix get_sets_with_minifigs() returning wrong data (C6)
--
-- The function declared RETURNS TABLE(set_num text) but selected inventory_id
-- (an integer FK) aliased as set_num, returning IDs like "12345" instead of
-- actual set numbers like "60001-1".
--
-- Fix: Join rb_inventory_minifigs to rb_inventories to resolve the actual
-- set_num, and filter out fig-% entries.

CREATE OR REPLACE FUNCTION public.get_sets_with_minifigs()
RETURNS TABLE(set_num text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ri.set_num
  FROM public.rb_inventory_minifigs rim
  JOIN public.rb_inventories ri ON ri.id = rim.inventory_id
  WHERE ri.set_num IS NOT NULL AND ri.set_num NOT LIKE 'fig-%'
  ORDER BY ri.set_num;
$$;

COMMENT ON FUNCTION public.get_sets_with_minifigs IS
  'Returns set_nums for all sets containing minifigures in the Rebrickable catalog';
