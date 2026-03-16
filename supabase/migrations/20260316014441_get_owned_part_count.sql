-- Returns total owned quantity for a part+color across all sets
-- the user has marked as "owned". Single indexed join, ~1-2ms.
CREATE OR REPLACE FUNCTION get_owned_part_count(
  p_user_id uuid,
  p_part_num text,
  p_color_id integer
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(ip.quantity), 0)::integer
  FROM user_sets us
  JOIN rb_inventories ri ON ri.set_num = us.set_num
  JOIN rb_inventory_parts ip ON ip.inventory_id = ri.id
  WHERE us.user_id = p_user_id
    AND us.owned = true
    AND ip.part_num = p_part_num
    AND ip.color_id = p_color_id
    AND ip.is_spare = false;
$$;
