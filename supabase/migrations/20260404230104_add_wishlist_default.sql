-- Migration: Default Wishlist for all users
-- Ensures every user (existing and new) has a system "Wishlist" list.
-- Prior ownership-overhaul migration only created Wishlists for users who
-- had legacy `want` sets at migration time, leaving new signups and users
-- with no wants without a system list.

-- Step 1: Function to create a user's Wishlist, invoked by the trigger.
-- SECURITY DEFINER so it can insert into user_lists regardless of whether
-- the auth.users row's RLS context is set (trigger fires before session).
create or replace function public.ensure_user_wishlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_lists (user_id, name, is_system)
  values (new.id, 'Wishlist', true)
  on conflict do nothing;
  return new;
end;
$$;

comment on function public.ensure_user_wishlist is
  'Creates a default system Wishlist for each new auth.users row.';

-- Step 2: Trigger on auth.users insert.
drop trigger if exists on_auth_user_created_ensure_wishlist on auth.users;

create trigger on_auth_user_created_ensure_wishlist
  after insert on auth.users
  for each row execute function public.ensure_user_wishlist();

-- Step 3: Backfill — insert a Wishlist for any existing user that lacks one.
insert into public.user_lists (user_id, name, is_system)
select u.id, 'Wishlist', true
from auth.users u
where not exists (
  select 1 from public.user_lists ul
  where ul.user_id = u.id
    and ul.is_system = true
    and ul.name = 'Wishlist'
);
