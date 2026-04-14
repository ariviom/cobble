-- Add entitlement_override_tier column to admin_users_overview so the admin
-- dashboard can show users who have been manually granted Plus (or Pro) via
-- billing_entitlement_overrides. Overrides are keyed by lowercased email.

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
  join public.user_lists ul
    on ul.id = li.list_id
   and ul.is_system = true
   and ul.name = 'Wishlist'
  where li.item_type = 'set'
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
  order by user_id, created_at desc nulls last
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
  s.cancel_at_period_end as subscription_cancel_at_period_end,
  eo.tier as entitlement_override_tier
from auth.users u
left join public.user_profiles p on p.user_id = u.id
left join owned_counts oc on oc.user_id = u.id
left join tracked_counts tc on tc.user_id = u.id
left join list_counts lc on lc.user_id = u.id
left join latest_sub s on s.user_id = u.id
left join public.billing_entitlement_overrides eo on eo.email = lower(u.email);

revoke all on public.admin_users_overview from public;
revoke all on public.admin_users_overview from anon;
revoke all on public.admin_users_overview from authenticated;
grant select on public.admin_users_overview to service_role;

comment on view public.admin_users_overview is
  'Admin dashboard: per-user identity + aggregated counts + latest subscription + manual entitlement overrides. '
  'Service role only — handler-level requireAdmin() gates access. '
  'Runs as definer (postgres) because service_role lacks direct auth.users access; '
  'grant-level restriction to service_role provides the security boundary.';
