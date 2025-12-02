-- Rename collections_public to lists_public and rebuild related policies.
alter table if exists public.user_profiles
  rename column collections_public to lists_public;

alter table if exists public.user_profiles
  alter column lists_public set default false;

drop policy if exists "Select public profiles when collections public"
  on public.user_profiles;

create policy "Select public profiles when lists public"
  on public.user_profiles
  for select
  using (lists_public = true);

-- Ensure user_sets public visibility policy references the renamed column.
drop policy if exists "Select sets when profile collections public"
  on public.user_sets;

create policy "Select sets when profile lists public"
  on public.user_sets
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = user_sets.user_id
        and p.lists_public = true
    )
  );

-- Remove legacy collection tables now that lists replace them.
drop table if exists public.user_collection_sets cascade;
drop table if exists public.user_collections cascade;

-- New item type enum (sets, minifigs; parts can be added later).
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'collection_item_type'
  ) then
    create type public.collection_item_type as enum ('set', 'minifig');
  end if;
end $$;

-- Lists replace collections and will back the /collection route.
create table if not exists public.user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_lists_user_name_unique
  on public.user_lists (user_id, lower(name));

-- Cross-reference table that supports sets and minifig items (parts later).
create table if not exists public.user_list_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid not null references public.user_lists (id) on delete cascade,
  item_type public.collection_item_type not null,
  set_num text references public.rb_sets (set_num) on delete cascade,
  minifig_id text references public.rb_minifigs (fig_num) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_list_items_target_check check (
    (item_type = 'set' and set_num is not null and minifig_id is null)
    or
    (item_type = 'minifig' and minifig_id is not null and set_num is null)
  )
);

create index if not exists user_list_items_user_idx
  on public.user_list_items (user_id);

create unique index if not exists user_list_items_set_unique
  on public.user_list_items (user_id, list_id, set_num)
  where item_type = 'set';

create unique index if not exists user_list_items_minifig_unique
  on public.user_list_items (user_id, list_id, minifig_id)
  where item_type = 'minifig';

-- Track owned / wishlist status for minifigs similar to user_sets.
create table if not exists public.user_minifigs (
  user_id uuid not null references auth.users (id) on delete cascade,
  fig_num text not null references public.rb_minifigs (fig_num) on delete cascade,
  status public.set_status not null default 'want',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_minifigs_pkey primary key (user_id, fig_num)
);

create index if not exists user_minifigs_status_idx
  on public.user_minifigs (status);

-- Enable RLS and policies for the new tables.
alter table public.user_lists enable row level security;
alter table public.user_list_items enable row level security;
alter table public.user_minifigs enable row level security;

-- user_lists policies
drop policy if exists "Select own lists" on public.user_lists;
drop policy if exists "Insert own lists" on public.user_lists;
drop policy if exists "Update own lists" on public.user_lists;
drop policy if exists "Delete own lists" on public.user_lists;
drop policy if exists "Select lists when profile lists public" on public.user_lists;

create policy "Select own lists" on public.user_lists
  for select
  using (auth.uid() = user_id);

create policy "Insert own lists" on public.user_lists
  for insert
  with check (auth.uid() = user_id);

create policy "Update own lists" on public.user_lists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own lists" on public.user_lists
  for delete
  using (auth.uid() = user_id);

create policy "Select lists when profile lists public" on public.user_lists
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = public.user_lists.user_id
        and p.lists_public = true
    )
  );

-- user_list_items policies
drop policy if exists "Select own list items" on public.user_list_items;
drop policy if exists "Insert own list items" on public.user_list_items;
drop policy if exists "Delete own list items" on public.user_list_items;
drop policy if exists "Select list items when profile lists public" on public.user_list_items;

create policy "Select own list items" on public.user_list_items
  for select
  using (auth.uid() = user_id);

create policy "Insert own list items" on public.user_list_items
  for insert
  with check (auth.uid() = user_id);

create policy "Delete own list items" on public.user_list_items
  for delete
  using (auth.uid() = user_id);

create policy "Select list items when profile lists public" on public.user_list_items
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = public.user_list_items.user_id
        and p.lists_public = true
    )
  );

-- user_minifigs policies
drop policy if exists "Select own minifigs" on public.user_minifigs;
drop policy if exists "Insert own minifigs" on public.user_minifigs;
drop policy if exists "Update own minifigs" on public.user_minifigs;
drop policy if exists "Delete own minifigs" on public.user_minifigs;
drop policy if exists "Select minifigs when profile lists public" on public.user_minifigs;

create policy "Select own minifigs" on public.user_minifigs
  for select
  using (auth.uid() = user_id);

create policy "Insert own minifigs" on public.user_minifigs
  for insert
  with check (auth.uid() = user_id);

create policy "Update own minifigs" on public.user_minifigs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own minifigs" on public.user_minifigs
  for delete
  using (auth.uid() = user_id);

create policy "Select minifigs when profile lists public" on public.user_minifigs
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = public.user_minifigs.user_id
        and p.lists_public = true
    )
  );

