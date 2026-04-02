-- Delete ended group sessions older than 30 days.
-- CASCADE on group_sessions deletes associated participant records.
-- 30 days aligns with the free-tier Search Party entitlement (2/month).
select cron.schedule(
  'cleanup-ended-group-sessions',
  '0 3 * * *',   -- daily at 03:00 UTC
  $$DELETE FROM public.group_sessions
    WHERE is_active = false
      AND ended_at IS NOT NULL
      AND ended_at < now() - interval '30 days'$$
);
