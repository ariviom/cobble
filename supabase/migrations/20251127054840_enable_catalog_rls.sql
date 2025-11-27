-- Enable row level security on Rebrickable catalog tables exposed via PostgREST.
alter table if exists public.rb_themes enable row level security;
alter table if exists public.rb_colors enable row level security;
alter table if exists public.rb_parts enable row level security;
alter table if exists public.rb_sets enable row level security;
alter table if exists public.rb_set_parts enable row level security;
alter table if exists public.rb_part_categories enable row level security;
alter table if exists public.rb_minifigs enable row level security;
alter table if exists public.rb_inventories enable row level security;
alter table if exists public.rb_inventory_parts enable row level security;
alter table if exists public.rb_inventory_minifigs enable row level security;
alter table if exists public.rb_download_versions enable row level security;

-- Allow anonymous and authenticated clients to read catalog lookup tables.
create policy "Allow read rb_themes"
  on public.rb_themes
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_colors"
  on public.rb_colors
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_parts"
  on public.rb_parts
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_sets"
  on public.rb_sets
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_set_parts"
  on public.rb_set_parts
  for select
  to anon, authenticated
  using (true);

create policy "Allow read rb_part_categories"
  on public.rb_part_categories
  for select
  to anon, authenticated
  using (true);

