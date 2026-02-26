-- System-wide counters (not per-user) for tracking shared quotas like
-- BrickLink daily API calls across all server instances.

create table public.system_counters (
  counter_key  text    not null,
  window_start date    not null,
  count        int     not null default 0,
  updated_at   timestamptz default now(),
  primary key (counter_key, window_start)
);

alter table public.system_counters enable row level security;

-- Only service_role can read/write system counters.
create policy system_counters_service_role_all
  on public.system_counters
  for all
  to service_role
  using (true)
  with check (true);

-- Atomic check-and-increment for system counters.
-- Returns (allowed, new_count). The increment always happens; if allowed is
-- false the count already exceeded the limit on this call.
create or replace function increment_system_counter(
  p_key          text,
  p_window_start date,
  p_limit        int
) returns table (allowed boolean, new_count int) as $$
declare
  v_count int;
begin
  insert into system_counters (counter_key, window_start, count, updated_at)
  values (p_key, p_window_start, 1, now())
  on conflict (counter_key, window_start)
  do update set
    count      = system_counters.count + 1,
    updated_at = now()
  returning system_counters.count into v_count;

  return query select (v_count <= p_limit), v_count;
end;
$$ language plpgsql security definer;

revoke all on function increment_system_counter(text, date, int) from public;
grant execute on function increment_system_counter(text, date, int) to service_role;

-- Read current count without incrementing (for monitoring / pre-check).
create or replace function get_system_counter(
  p_key          text,
  p_window_start date
) returns int as $$
  select coalesce(
    (select count from system_counters
     where counter_key = p_key and window_start = p_window_start),
    0
  );
$$ language sql security definer stable;

revoke all on function get_system_counter(text, date) from public;
grant execute on function get_system_counter(text, date) to service_role;

-- Include system_counters in the retention cron (clean up old windows).
-- This depends on the pg_cron extension enabled in the previous migration.
select cron.schedule(
  'cleanup-system-counters',
  '0 3 * * *',
  $$DELETE FROM public.system_counters
    WHERE window_start < current_date - interval '7 days'$$
);
