-- BrickLink categories table for minifig theme/category lookups
-- Categories come from BrickLink's /categories endpoint

create table if not exists public.bricklink_categories (
  category_id integer primary key,
  category_name text not null,
  parent_id integer references public.bricklink_categories(category_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for parent lookups (finding root category)
create index if not exists bricklink_categories_parent_idx
  on public.bricklink_categories (parent_id);

-- Index for name searches
create index if not exists bricklink_categories_name_idx
  on public.bricklink_categories (category_name);

-- Enable RLS
alter table public.bricklink_categories enable row level security;

-- Allow anonymous read access (catalog data)
create policy "bricklink_categories_anon_select"
  on public.bricklink_categories
  for select
  to anon, authenticated
  using (true);

-- Add trigger for updated_at
create or replace function update_bricklink_categories_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger bricklink_categories_updated_at
  before update on public.bricklink_categories
  for each row
  execute function update_bricklink_categories_updated_at();

comment on table public.bricklink_categories is 'BrickLink category catalog for minifig themes';
comment on column public.bricklink_categories.category_id is 'BrickLink category ID';
comment on column public.bricklink_categories.category_name is 'Category display name';
comment on column public.bricklink_categories.parent_id is 'Parent category ID for hierarchy';
