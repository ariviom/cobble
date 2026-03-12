-- billing_entitlement_overrides: email-based tier floor for manual upgrades.
-- Managed via Supabase dashboard SQL; service_role access only.
-- Emails are auto-lowercased on insert/update via trigger.

create table if not exists public.billing_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tier text not null default 'plus' check (tier in ('plus', 'pro')),
  reason text,
  created_at timestamptz default now()
);

alter table public.billing_entitlement_overrides enable row level security;

-- Service-role only — no authenticated user access needed
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_entitlement_overrides'
      and policyname = 'billing_entitlement_overrides_service_role_all'
  ) then
    create policy billing_entitlement_overrides_service_role_all
      on public.billing_entitlement_overrides
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- Auto-lowercase email on insert/update to prevent case mismatch issues
create or replace function public.billing_entitlement_overrides_lowercase_email()
returns trigger as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lowercase_email on public.billing_entitlement_overrides;
create trigger trg_lowercase_email
  before insert or update on public.billing_entitlement_overrides
  for each row execute function public.billing_entitlement_overrides_lowercase_email();

-- Unique index on email (trigger ensures lowercase)
create unique index if not exists billing_entitlement_overrides_email_idx
  on public.billing_entitlement_overrides (email);
