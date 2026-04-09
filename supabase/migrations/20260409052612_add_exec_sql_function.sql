-- exec_sql: allows the service-role client to run arbitrary SQL via RPC.
-- Used by the ingest script to refresh materialized views.
-- SECURITY DEFINER runs as the function owner (postgres), so only
-- service-role callers (authenticated via service_role key) should invoke this.

create or replace function public.exec_sql(query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute query;
end;
$$;

-- Revoke from public/anon so only service_role can call it
revoke execute on function public.exec_sql(text) from public;
revoke execute on function public.exec_sql(text) from anon;
revoke execute on function public.exec_sql(text) from authenticated;
