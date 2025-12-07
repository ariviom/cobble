-- Cache table for Rebrickable minifig image URLs fetched via API.
-- This allows us to call the RB API once per fig and then serve images from
-- our own catalog.

create table if not exists public.rb_minifig_images (
  fig_num text primary key references public.rb_minifigs (fig_num) on delete cascade,
  image_url text not null,
  last_fetched_at timestamptz not null default now()
);

alter table if exists public.rb_minifig_images
  enable row level security;

-- Allow anonymous and authenticated clients to read cached image URLs.
drop policy if exists "Allow read rb_minifig_images" on public.rb_minifig_images;

create policy "Allow read rb_minifig_images"
  on public.rb_minifig_images
  for select
  to anon, authenticated
  using (true);








