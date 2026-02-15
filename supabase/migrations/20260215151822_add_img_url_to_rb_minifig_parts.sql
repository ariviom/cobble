-- Add img_url column to rb_minifig_parts for color-specific part images.
-- Populated during materializeMinifigParts() from rb_inventory_parts.img_url.

ALTER TABLE public.rb_minifig_parts
  ADD COLUMN IF NOT EXISTS img_url text;
