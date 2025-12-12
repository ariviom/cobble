-- Billing foundation: customers, subscriptions, webhook idempotency, feature flags/overrides.

-- billing_customers ---------------------------------------------------------
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_customer_id text unique not null,
  email text,
  created_at timestamptz default now()
);

alter table public.billing_customers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_customers'
      and policyname = 'billing_customers_owner_select'
  ) then
    create policy billing_customers_owner_select
      on public.billing_customers
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_customers'
      and policyname = 'billing_customers_service_role_all'
  ) then
    create policy billing_customers_service_role_all
      on public.billing_customers
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

create index if not exists billing_customers_stripe_customer_id_idx
  on public.billing_customers (stripe_customer_id);

-- billing_subscriptions -----------------------------------------------------
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_price_id text not null,
  stripe_product_id text not null,
  tier text check (tier in ('free', 'plus', 'pro')),
  status text check (status in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired')),
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  quantity int default 1,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.billing_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_subscriptions'
      and policyname = 'billing_subscriptions_owner_select'
  ) then
    create policy billing_subscriptions_owner_select
      on public.billing_subscriptions
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_subscriptions'
      and policyname = 'billing_subscriptions_service_role_all'
  ) then
    create policy billing_subscriptions_service_role_all
      on public.billing_subscriptions
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

create index if not exists billing_subscriptions_stripe_subscription_id_idx
  on public.billing_subscriptions (stripe_subscription_id);

-- billing_webhook_events (idempotency + audit) ------------------------------
create table if not exists public.billing_webhook_events (
  event_id text primary key,
  type text,
  payload jsonb,
  processed_at timestamptz,
  status text,
  error text
);

alter table public.billing_webhook_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_webhook_events'
      and policyname = 'billing_webhook_events_service_role_all'
  ) then
    create policy billing_webhook_events_service_role_all
      on public.billing_webhook_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- feature_flags -------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key,
  description text,
  min_tier text check (min_tier in ('free','plus','pro')),
  rollout_pct int default 100 check (rollout_pct between 0 and 100),
  is_enabled boolean default true
);

alter table public.feature_flags enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feature_flags'
      and policyname = 'feature_flags_service_role_all'
  ) then
    create policy feature_flags_service_role_all
      on public.feature_flags
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- feature_overrides ---------------------------------------------------------
create table if not exists public.feature_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  feature_key text references public.feature_flags(key) on delete cascade,
  force boolean not null,
  created_at timestamptz default now()
);

alter table public.feature_overrides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feature_overrides'
      and policyname = 'feature_overrides_owner_select'
  ) then
    create policy feature_overrides_owner_select
      on public.feature_overrides
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feature_overrides'
      and policyname = 'feature_overrides_service_role_all'
  ) then
    create policy feature_overrides_service_role_all
      on public.feature_overrides
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

create index if not exists feature_overrides_user_idx
  on public.feature_overrides (user_id);

create index if not exists feature_overrides_feature_idx
  on public.feature_overrides (feature_key);

-- Seed initial feature flags (idempotent) -----------------------------------
insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values
  ('identify.unlimited', 'Unlimited identify usage', 'plus', 100, true),
  ('lists.unlimited', 'Unlimited custom lists', 'plus', 100, true),
  ('lists.upload', 'Custom list uploads', 'plus', 100, true),
  ('search_party.advanced', 'Advanced Search Party features', 'plus', 100, true),
  ('bricklink.byo_key', 'Bring your own BrickLink key (real-time)', 'pro', 100, true),
  ('mocs.custom', 'Custom MOCs support', 'pro', 100, true)
on conflict (key) do update
set
  description = excluded.description,
  min_tier = excluded.min_tier,
  rollout_pct = excluded.rollout_pct,
  is_enabled = excluded.is_enabled;

