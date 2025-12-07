-- Add color-specific image URL for inventory parts so local catalog
-- inventories can serve accurate thumbnails without hitting the live API.
alter table public.rb_inventory_parts
  add column if not exists img_url text;
