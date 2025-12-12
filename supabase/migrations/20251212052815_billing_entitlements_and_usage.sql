-- Usage counters for feature quotas + feature flag seed updates

-- usage_counters -------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users on delete cascade,
  feature_key text not null,
  window_kind text not null check (window_kind in ('daily','monthly')),
  window_start date not null,
  count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, feature_key, window_kind, window_start)
);

create index if not exists usage_counters_feature_window_idx
  on public.usage_counters (feature_key, window_kind, window_start);

alter table public.usage_counters enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'usage_counters'
      and policyname = 'usage_counters_service_role_all'
  ) then
    create policy usage_counters_service_role_all
      on public.usage_counters
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- feature_flags seeds --------------------------------------------------------
insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values
  ('identify.unlimited', 'Unlimited Identify for paid plans', 'plus', 100, true),
  ('lists.unlimited', 'Unlimited custom lists', 'plus', 100, true),
  ('lists.upload', 'List uploads / MOC imports', 'plus', 100, false),
  ('search_party.unlimited', 'Unlimited Search Party sessions', 'plus', 100, true),
  ('search_party.advanced', 'Advanced Search Party tools (bounties, scoring)', 'plus', 100, false),
  ('pricing.full_cached', 'In-app cached pricing (historical averages)', 'plus', 100, true),
  ('pricing.realtime', 'Real-time pricing via BYO BrickLink key', 'pro', 100, false),
  ('sync.cloud', 'Cloud sync across devices', 'plus', 100, true),
  ('bricklink.byo_key', 'Bring your own BrickLink API key', 'pro', 100, false),
  ('mocs.custom', 'Custom MOC import/support', 'pro', 100, false),
  ('bulk.tools', 'Bulk ops: inventory merge, multi-set planning, list diff', 'pro', 100, false)
on conflict (key) do update
set
  description = excluded.description,
  min_tier = excluded.min_tier,
  rollout_pct = excluded.rollout_pct,
  is_enabled = excluded.is_enabled;

