-- Only compute total_count when p_include_count is true (page 1).
-- Avoids redundant CTE scan on subsequent pages.
DROP FUNCTION IF EXISTS get_sets_for_part(text, integer, integer);

CREATE OR REPLACE FUNCTION get_sets_for_part(
  p_part_num text,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_include_count boolean DEFAULT false
) RETURNS TABLE (
  set_num text,
  name text,
  year smallint,
  image_url text,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH matched_sets AS (
    SELECT DISTINCT ri.set_num
    FROM rb_inventory_parts ip
    JOIN rb_inventories ri ON ri.id = ip.inventory_id
    WHERE ip.part_num = p_part_num
      AND ip.is_spare = false
      AND ri.set_num NOT LIKE 'fig-%'
  )
  SELECT
    s.set_num,
    s.name,
    s.year,
    s.image_url,
    CASE WHEN p_include_count
      THEN (SELECT count(*) FROM matched_sets)
      ELSE 0
    END AS total_count
  FROM matched_sets ms
  JOIN rb_sets s ON s.set_num = ms.set_num
  ORDER BY s.year DESC NULLS LAST, s.set_num
  LIMIT p_limit
  OFFSET p_offset;
$$;
