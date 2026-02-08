ALTER TABLE public.bl_minifig_parts
  ADD COLUMN IF NOT EXISTS rb_color_id INTEGER;

COMMENT ON COLUMN public.bl_minifig_parts.rb_color_id IS
  'Rebrickable color ID mapped from bl_color_id at sync time. NULL if no mapping exists.';
