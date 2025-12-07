-- Distributed rate limiting backed by Postgres
-- Creates a durable rate limit bucket table and a helper RPC that atomically
-- increments buckets and returns remaining window seconds.

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  window_ms integer not null default 60000,
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_key text,
  p_max_hits integer default 60,
  p_window_ms integer default 60000
) returns table (
  allowed boolean,
  retry_after_seconds integer
) as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_window_start timestamptz;
  v_window_ms integer := greatest(1, coalesce(p_window_ms, 60000));
  v_max_hits integer := greatest(1, coalesce(p_max_hits, 60));
begin
  insert into public.rate_limits (key, count, window_start, window_ms, updated_at)
  values (p_key, 1, v_now, v_window_ms, v_now)
  on conflict (key) do update
  set
    count = case
      when public.rate_limits.window_start + (public.rate_limits.window_ms || ' milliseconds')::interval < v_now
        then 1
      else public.rate_limits.count + 1
    end,
    window_start = case
      when public.rate_limits.window_start + (public.rate_limits.window_ms || ' milliseconds')::interval < v_now
        then v_now
      else public.rate_limits.window_start
    end,
    window_ms = excluded.window_ms,
    updated_at = v_now
  returning count, window_start into v_count, v_window_start;

  if v_count > v_max_hits then
    return query
      select
        false,
        greatest(
          1,
          ceil(
            extract(
              epoch from (v_window_start + (v_window_ms || ' milliseconds')::interval - v_now)
            )::numeric
          )::integer
        );
  else
    return query select true, 0;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

comment on table public.rate_limits is 'Durable rate limit buckets for distributed workers';
comment on function public.consume_rate_limit is 'Atomic rate limit increment with window reset and retry-after response';

revoke all on function public.consume_rate_limit from public;
grant execute on function public.consume_rate_limit to anon, authenticated, service_role;
