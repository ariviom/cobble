create table if not exists public.bricklink_minifigs (
  item_id text primary key,
  name text not null,
  category_id integer,
  item_year integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bricklink_minifig_mappings (
  rb_fig_id text primary key,
  bl_item_id text not null references public.bricklink_minifigs(item_id) on delete cascade,
  confidence numeric,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bricklink_minifigs_name_idx
  on public.bricklink_minifigs
  using gin (to_tsvector('english', name));

create index if not exists bricklink_minifigs_category_idx
  on public.bricklink_minifigs (category_id);


