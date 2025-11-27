-- Add optional username and public collections toggle to user_profiles.
alter table if exists public.user_profiles
  add column if not exists username text,
  add column if not exists collections_public boolean not null default false;

-- Ensure usernames are unique (case-insensitive) when present.
create unique index if not exists user_profiles_username_unique
  on public.user_profiles ((lower(username)))
  where username is not null;


drop policy if exists "Select public profiles when collections public"
  on public.user_profiles;

create policy "Select public profiles when collections public"
  on public.user_profiles
  for select
  using (collections_public = true);


drop policy if exists "Select sets when profile collections public"
  on public.user_sets;

create policy "Select sets when profile collections public"
  on public.user_sets
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = user_sets.user_id
        and p.collections_public = true
    )
  );


drop policy if exists "Select collections when profile collections public"
  on public.user_collections;

create policy "Select collections when profile collections public"
  on public.user_collections
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = user_collections.user_id
        and p.collections_public = true
    )
  );


drop policy if exists "Select collection sets when profile collections public"
  on public.user_collection_sets;

create policy "Select collection sets when profile collections public"
  on public.user_collection_sets
  for select
  using (
    exists (
      select 1
      from public.user_profiles p
      where p.user_id = user_collection_sets.user_id
        and p.collections_public = true
    )
  );


