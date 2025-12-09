-- Cache for BrickLink parts and their supersets / inferred sets
create table if not exists public.bl_parts (
    bl_part_id text primary key,
    name text,
    image_url text,
    last_fetched_at timestamptz not null default now()
);

create table if not exists public.bl_part_sets (
    bl_part_id text not null references public.bl_parts(bl_part_id) on delete cascade,
    set_num text not null,
    quantity integer,
    source text not null,
    last_fetched_at timestamptz not null default now(),
    primary key (bl_part_id, set_num)
);

create index if not exists bl_part_sets_fetched_idx on public.bl_part_sets (last_fetched_at);

