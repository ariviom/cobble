-- Add created_at to billing_webhook_events for operational debugging
-- (detect stuck events that were received but never processed)
ALTER TABLE billing_webhook_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Add 'paused' to billing_subscriptions status check constraint
-- so Stripe pause_collection doesn't cause webhook 500s.
-- Also add 'deferred' to billing_webhook_events status vocabulary.
ALTER TABLE billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_status_check;

ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused'));
