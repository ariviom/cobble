-- Public-safe views for collections, sets, and minifigs when profiles are marked public.
-- Mirrors the online-applied changes so local/dev environments stay in sync.

-- View: public user profiles (public-only)
create or replace view public_user_profiles_view as
select user_id, username, display_name, lists_public
from public.user_profiles
where coalesce(lists_public, false) = true;

-- View: public user sets
create or replace view public_user_sets_view as
select us.user_id, us.set_num, us.status
from public.user_sets us
join public.user_profiles up on up.user_id = us.user_id
where coalesce(up.lists_public, false) = true;

-- View: public user minifigs
create or replace view public_user_minifigs_view as
select um.user_id, um.fig_num, um.status
from public.user_minifigs um
join public.user_profiles up on up.user_id = um.user_id
where coalesce(up.lists_public, false) = true;

-- View: public user lists (metadata only)
create or replace view public_user_lists_view as
select ul.id, ul.user_id, ul.name, ul.is_system
from public.user_lists ul
join public.user_profiles up on up.user_id = ul.user_id
where coalesce(up.lists_public, false) = true;

-- View: public user list items (only when owner is public)
create or replace view public_user_list_items_view as
select uli.user_id, uli.list_id, uli.item_type, uli.set_num, uli.minifig_id
from public.user_list_items uli
join public.user_profiles up on up.user_id = uli.user_id
where coalesce(up.lists_public, false) = true;

-- Policies: user_profiles select when public
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles' AND policyname = 'public_profiles_select_public'
  ) THEN
    CREATE POLICY public_profiles_select_public
      ON public.user_profiles
      FOR SELECT
      TO anon, authenticated
      USING (coalesce(lists_public, false) = true);
  END IF;
END$$;

-- Policies: user_sets select when owner is public
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_sets' AND policyname = 'public_user_sets_select_public'
  ) THEN
    CREATE POLICY public_user_sets_select_public
      ON public.user_sets
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = user_sets.user_id
            AND coalesce(up.lists_public, false) = true
        )
      );
  END IF;
END$$;

-- Policies: user_minifigs select when owner is public
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_minifigs' AND policyname = 'public_user_minifigs_select_public'
  ) THEN
    CREATE POLICY public_user_minifigs_select_public
      ON public.user_minifigs
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = user_minifigs.user_id
            AND coalesce(up.lists_public, false) = true
        )
      );
  END IF;
END$$;

-- Policies: user_lists select when owner is public
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_lists' AND policyname = 'public_user_lists_select_public'
  ) THEN
    CREATE POLICY public_user_lists_select_public
      ON public.user_lists
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = user_lists.user_id
            AND coalesce(up.lists_public, false) = true
        )
      );
  END IF;
END$$;

-- Policies: user_list_items select when owner is public
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_list_items' AND policyname = 'public_user_list_items_select_public'
  ) THEN
    CREATE POLICY public_user_list_items_select_public
      ON public.user_list_items
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.user_id = user_list_items.user_id
            AND coalesce(up.lists_public, false) = true
        )
      );
  END IF;
END$$;

