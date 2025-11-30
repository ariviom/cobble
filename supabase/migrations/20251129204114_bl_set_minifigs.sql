create table if not exists public.bl_sets (
  set_num text primary key,
  name text,
  year integer,
  last_minifig_sync_at timestamptz,
  minifig_sync_status text,
  last_error text
);

create table if not exists public.bl_set_minifigs (
  set_num text not null references public.bl_sets (set_num) on delete cascade,
  minifig_no text not null,
  name text,
  quantity integer not null default 1,
  image_url text,
  last_refreshed_at timestamptz,
  constraint bl_set_minifigs_pkey primary key (set_num, minifig_no)
);

create index if not exists bl_set_minifigs_set_idx
  on public.bl_set_minifigs (set_num);



