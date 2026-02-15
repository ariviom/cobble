-- Materialize rb_minifig_parts from rb_inventories + rb_inventory_parts.
-- The data already exists across those two tables for fig-* inventories;
-- this migration populates the denormalized lookup table used at runtime.

INSERT INTO public.rb_minifig_parts (fig_num, part_num, color_id, quantity)
SELECT ri.set_num, rip.part_num, rip.color_id, SUM(rip.quantity)
FROM public.rb_inventories ri
JOIN public.rb_inventory_parts rip ON rip.inventory_id = ri.id
JOIN public.rb_parts rp ON rp.part_num = rip.part_num        -- FK safety
JOIN public.rb_colors rc ON rc.id = rip.color_id             -- FK safety
WHERE ri.set_num LIKE 'fig-%'
  AND rip.is_spare = false
GROUP BY ri.set_num, rip.part_num, rip.color_id
ON CONFLICT (fig_num, part_num, color_id) DO UPDATE SET quantity = EXCLUDED.quantity;
