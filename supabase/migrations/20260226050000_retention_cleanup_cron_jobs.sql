-- Enable pg_cron for scheduled retention cleanup.
-- Supabase Pro includes pg_cron; the extension lives in the "extensions" schema.
create extension if not exists pg_cron with schema extensions;

-- Grant usage so cron jobs can execute DML on public tables.
grant usage on schema cron to postgres;

-- 1. bl_price_observations: delete rows older than 180 days.
--    The 180d window is only used as a read filter in tryComputeDerivedPrice;
--    rows beyond that window are never queried and waste disk space.
select cron.schedule(
  'cleanup-price-observations',
  '0 3 * * *',   -- daily at 03:00 UTC
  $$DELETE FROM public.bl_price_observations
    WHERE observed_at < now() - interval '180 days'$$
);

-- 2. usage_counters: delete expired windows.
--    Only the current window is ever queried (by increment_usage_counter and getUsageStatus).
select cron.schedule(
  'cleanup-usage-counters',
  '0 3 * * *',
  $$DELETE FROM public.usage_counters
    WHERE (window_kind = 'daily'  AND window_start < current_date - interval '2 days')
       OR (window_kind = 'monthly' AND window_start < date_trunc('month', current_date) - interval '1 month')$$
);

-- 3. billing_webhook_events: delete processed events older than 30 days.
--    Stripe retries webhooks for ~3 days; 30d is generous for audit.
--    Guard against NULL processed_at (in-flight events).
select cron.schedule(
  'cleanup-webhook-events',
  '0 3 * * *',
  $$DELETE FROM public.billing_webhook_events
    WHERE processed_at IS NOT NULL
      AND processed_at < now() - interval '30 days'$$
);
