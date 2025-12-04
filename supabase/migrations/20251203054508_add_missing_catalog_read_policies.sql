-- Add missing read policies for RB catalog tables that were overlooked
-- in the initial RLS migration (20251127054840_enable_catalog_rls.sql).
-- Without these policies, client queries with embedded relationships
-- (e.g., user_minifigs -> rb_minifigs) return null for the embedded data.

create policy "Allow read rb_minifigs"
  on public.rb_minifigs
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_inventories"
  on public.rb_inventories
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_inventory_parts"
  on public.rb_inventory_parts
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_inventory_minifigs"
  on public.rb_inventory_minifigs
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_minifig_parts"
  on public.rb_minifig_parts
  for select
  to anon, authenticated
  using (true);


