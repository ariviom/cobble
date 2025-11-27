-- Improve RLS policy performance by avoiding repeated auth.uid() evaluation
-- and consolidating overlapping permissive select policies.

-- Drop existing policies so we can recreate them with optimized definitions.
drop policy if exists "Select own profile" on public.user_profiles;
drop policy if exists "Insert own profile" on public.user_profiles;
drop policy if exists "Update own profile" on public.user_profiles;
drop policy if exists "Delete own profile" on public.user_profiles;
drop policy if exists "Select public profiles when collections public" on public.user_profiles;

drop policy if exists "Select own preferences" on public.user_preferences;
drop policy if exists "Insert own preferences" on public.user_preferences;
drop policy if exists "Update own preferences" on public.user_preferences;
drop policy if exists "Delete own preferences" on public.user_preferences;

drop policy if exists "Select own sets" on public.user_sets;
drop policy if exists "Insert own sets" on public.user_sets;
drop policy if exists "Update own sets" on public.user_sets;
drop policy if exists "Delete own sets" on public.user_sets;
drop policy if exists "Select sets when profile collections public" on public.user_sets;

drop policy if exists "Select own set parts" on public.user_set_parts;
drop policy if exists "Insert own set parts" on public.user_set_parts;
drop policy if exists "Update own set parts" on public.user_set_parts;
drop policy if exists "Delete own set parts" on public.user_set_parts;

drop policy if exists "Select own parts inventory" on public.user_parts_inventory;
drop policy if exists "Insert own parts inventory" on public.user_parts_inventory;
drop policy if exists "Update own parts inventory" on public.user_parts_inventory;
drop policy if exists "Delete own parts inventory" on public.user_parts_inventory;

drop policy if exists "Select own collections" on public.user_collections;
drop policy if exists "Insert own collections" on public.user_collections;
drop policy if exists "Update own collections" on public.user_collections;
drop policy if exists "Delete own collections" on public.user_collections;
drop policy if exists "Select collections when profile collections public" on public.user_collections;

drop policy if exists "Select own collection sets" on public.user_collection_sets;
drop policy if exists "Insert own collection sets" on public.user_collection_sets;
drop policy if exists "Delete own collection sets" on public.user_collection_sets;
drop policy if exists "Select collection sets when profile collections public" on public.user_collection_sets;

drop policy if exists "Public read active group sessions" on public.group_sessions;
drop policy if exists "Hosts manage their group sessions" on public.group_sessions;

-- Recreate policies using (select auth.uid()) so auth context is computed once
-- per statement, and consolidate overlapping select policies.

-- user_profiles
create policy "Select user profiles"
  on public.user_profiles
  for select
  using (
    (select auth.uid()) = user_id
    or collections_public = true
  );

create policy "Insert own profile"
  on public.user_profiles
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Update own profile"
  on public.user_profiles
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own profile"
  on public.user_profiles
  for delete
  using ((select auth.uid()) = user_id);

-- user_preferences
create policy "Select own preferences"
  on public.user_preferences
  for select
  using ((select auth.uid()) = user_id);

create policy "Insert own preferences"
  on public.user_preferences
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Update own preferences"
  on public.user_preferences
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own preferences"
  on public.user_preferences
  for delete
  using ((select auth.uid()) = user_id);

-- user_sets
create policy "Select user sets"
  on public.user_sets
  for select
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.user_profiles p
      where p.user_id = public.user_sets.user_id
        and p.collections_public = true
    )
  );

create policy "Insert own sets"
  on public.user_sets
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Update own sets"
  on public.user_sets
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own sets"
  on public.user_sets
  for delete
  using ((select auth.uid()) = user_id);

-- user_set_parts
create policy "Select own set parts"
  on public.user_set_parts
  for select
  using ((select auth.uid()) = user_id);

create policy "Insert own set parts"
  on public.user_set_parts
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Update own set parts"
  on public.user_set_parts
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own set parts"
  on public.user_set_parts
  for delete
  using ((select auth.uid()) = user_id);

-- user_parts_inventory
create policy "Select own parts inventory"
  on public.user_parts_inventory
  for select
  using ((select auth.uid()) = user_id);

create policy "Insert own parts inventory"
  on public.user_parts_inventory
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Update own parts inventory"
  on public.user_parts_inventory
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own parts inventory"
  on public.user_parts_inventory
  for delete
  using ((select auth.uid()) = user_id);

-- user_collections
create policy "Select user collections"
  on public.user_collections
  for select
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.user_profiles p
      where p.user_id = public.user_collections.user_id
        and p.collections_public = true
    )
  );

create policy "Insert own collections"
  on public.user_collections
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Update own collections"
  on public.user_collections
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Delete own collections"
  on public.user_collections
  for delete
  using ((select auth.uid()) = user_id);

-- user_collection_sets
create policy "Select user collection sets"
  on public.user_collection_sets
  for select
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.user_profiles p
      where p.user_id = public.user_collection_sets.user_id
        and p.collections_public = true
    )
  );

create policy "Insert own collection sets"
  on public.user_collection_sets
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Delete own collection sets"
  on public.user_collection_sets
  for delete
  using ((select auth.uid()) = user_id);

-- group_sessions
create policy "Read group sessions"
  on public.group_sessions
  for select
  using (
    is_active = true
    or (select auth.uid()) = host_user_id
  );

create policy "Insert group sessions as host"
  on public.group_sessions
  for insert
  with check ((select auth.uid()) = host_user_id);

create policy "Update group sessions as host"
  on public.group_sessions
  for update
  using ((select auth.uid()) = host_user_id)
  with check ((select auth.uid()) = host_user_id);

create policy "Delete group sessions as host"
  on public.group_sessions
  for delete
  using ((select auth.uid()) = host_user_id);

