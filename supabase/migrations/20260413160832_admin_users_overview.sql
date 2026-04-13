-- Admin-only overview of all users: joins auth.users + user_profiles + aggregated counts
-- + latest non-canceled billing_subscriptions row. Service-role SELECT only; no grants
-- to anon or authenticated.
--
-- Schema note: user_sets.status was dropped in the ownership-overhaul migration
-- (20260125035830). Owned sets are now rows in user_sets where owned = true.
-- Tracked/wishlisted sets live in user_list_items joined to the system Wishlist list.

create or replace view public.admin_users_overview as
with owned_counts as (
  select user_id, count(*)::int as owned_set_count
  from public.user_sets
  where owned = true
  group by user_id
),
tracked_counts as (
  select li.user_id, count(*)::int as tracked_set_count
  from public.user_list_items li
  join public.user_lists ul on ul.id = li.list_id
  where ul.is_system = true
    and ul.name = 'Wishlist'
    and li.item_type = 'set'
  group by li.user_id
),
list_counts as (
  select user_id, count(*)::int as list_count
  from public.user_lists
  where is_system = false
  group by user_id
),
latest_sub as (
  select distinct on (user_id)
    user_id,
    tier,
    status,
    current_period_end,
    cancel_at_period_end
  from public.billing_subscriptions
  where status <> 'canceled'
  order by user_id, created_at desc
)
select
  u.id as user_id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  p.username,
  p.display_name,
  coalesce(oc.owned_set_count, 0) as owned_set_count,
  coalesce(tc.tracked_set_count, 0) as tracked_set_count,
  coalesce(lc.list_count, 0) as list_count,
  s.tier as subscription_tier,
  s.status as subscription_status,
  s.current_period_end as subscription_period_end,
  s.cancel_at_period_end as subscription_cancel_at_period_end
from auth.users u
left join public.user_profiles p on p.user_id = u.id
left join owned_counts oc on oc.user_id = u.id
left join tracked_counts tc on tc.user_id = u.id
left join list_counts lc on lc.user_id = u.id
left join latest_sub s on s.user_id = u.id;

-- Revoke default grants; only service_role can select.
revoke all on public.admin_users_overview from public;
revoke all on public.admin_users_overview from anon;
revoke all on public.admin_users_overview from authenticated;
grant select on public.admin_users_overview to service_role;

comment on view public.admin_users_overview is
  'Admin dashboard: per-user identity + aggregated counts + latest subscription. '
  'Service role only — handler-level requireAdmin() gates access.';
