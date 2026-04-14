-- Fix get_owned_part_count over-counting when a set has multiple inventory versions.
--
-- Previous implementation joined user_sets → rb_inventories on set_num without
-- filtering by version. Rebrickable stores one rb_inventories row per inventory
-- revision per set, so a single owned set could inflate the summed quantity by
-- the number of versions it has (e.g. 1 set × 1 part × 3 versions = 3).
--
-- Fix: pick a single inventory per owned set (the latest version) before joining
-- rb_inventory_parts, mirroring the pattern used in app/lib/catalog/batchInventory.ts
-- and app/lib/catalog/sets.ts.

CREATE OR REPLACE FUNCTION get_owned_part_count(
  p_part_num text,
  p_color_id integer
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH latest_inventories AS (
    SELECT DISTINCT ON (ri.set_num) ri.id
    FROM rb_inventories ri
    JOIN user_sets us ON us.set_num = ri.set_num
    WHERE us.user_id = auth.uid()
      AND us.owned = true
    ORDER BY ri.set_num, ri.version DESC NULLS LAST
  )
  SELECT COALESCE(SUM(ip.quantity), 0)::integer
  FROM latest_inventories li
  JOIN rb_inventory_parts ip ON ip.inventory_id = li.id
  WHERE ip.part_num = p_part_num
    AND ip.color_id = p_color_id
    AND ip.is_spare = false;
$$
