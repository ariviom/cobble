-- Public read surface for inventory part thumbnails (color-specific images)
-- Exposes only non-sensitive catalog columns and keeps the base table RLS-enabled.

-- Create a narrow view with just the fields needed by the app
create or replace view public.rb_inventory_parts_public as
select
  inventory_id,
  part_num,
  color_id,
  quantity,
  is_spare,
  element_id,
  img_url
from public.rb_inventory_parts;

-- Ensure RLS remains enabled on the base table (no-op if already enabled)
alter table public.rb_inventory_parts enable row level security;

-- Allow anonymous/authenticated clients to read catalog thumbnails.
-- (Postgres does not support CREATE POLICY IF NOT EXISTS; drop first for safety.)
drop policy if exists "Allow public read of inventory part images" on public.rb_inventory_parts;
create policy "Allow public read of inventory part images"
  on public.rb_inventory_parts
  for select
  to anon, authenticated
  using (true);

-- Grant select on the view to public roles
grant select on public.rb_inventory_parts_public to anon, authenticated;
