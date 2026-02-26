-- L4: Make billing_subscriptions.user_id NOT NULL.
-- Every subscription must be associated with a user.

ALTER TABLE public.billing_subscriptions ALTER COLUMN user_id SET NOT NULL;
