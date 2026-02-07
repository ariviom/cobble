-- Drop FK constraints on part_num and color_id so that BrickLink IDs
-- (used for minifig subparts) can be stored without requiring matching
-- rows in rb_parts / rb_colors.
ALTER TABLE public.user_set_parts
  DROP CONSTRAINT IF EXISTS user_set_parts_part_num_fkey;
ALTER TABLE public.user_set_parts
  DROP CONSTRAINT IF EXISTS user_set_parts_color_id_fkey;
