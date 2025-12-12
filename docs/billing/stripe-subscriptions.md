# Stripe Subscriptions — Foundation and Post-Foundation Plan

This document defines the foundational architecture for Stripe subscriptions (Plus/Pro), along with post-foundation steps for UI enforcement, feature gating, and pricing expansion. Foundation work focuses on schema, backend flows, and operational readiness; post-foundation extends to UX, entitlements enforcement, and rollout controls.

## Snapshot Decisions

- Tiers: Free, Plus, Pro.
- Trial: 7 days for both Plus and Pro.
- Pricing: Monthly required; yearly supported but can be hidden at launch (omit UI use of yearly price IDs until ready).
- Currency: USD primary. Multi-currency/localized pricing is post-foundation.
- Countries: All Stripe-supported countries allowed.
- Tax/VAT: Enable Stripe Tax and automatic tax collection.
- Coupons/Promos: None at launch.
- Feature placement: Free keeps current features/limits; Plus = unlimited identify, unlimited custom lists, “Search Party” features, custom list uploads; Pro = everything in Plus + BYO key for real-time BrickLink + custom MOCs.

## Implementation Status (current)

- Supabase tables + RLS in place: `billing_customers`, `billing_subscriptions`, `billing_webhook_events`, `feature_flags`, `feature_overrides`.
- Server helpers: Stripe client, price allowlist, customer ensure, subscription upsert, entitlements resolver.
- API routes: `POST /api/billing/create-checkout-session`, `POST /api/billing/create-portal-session`, `POST /api/stripe/webhook` (idempotent).
- Beta override: `BETA_ALL_ACCESS=true` treats all users as Plus (Pro gating not wired yet).
- Pages for flows: `/billing/success`, `/billing/cancel`, `/account/billing` (billing portal entry).
- Tests: price allowlist/mapping.

## Environment Variables (set for test and live separately)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PLUS_MONTHLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PLUS_YEARLY` (optional; keep unset to hide at launch)
- `STRIPE_PRICE_PRO_YEARLY` (optional; keep unset to hide at launch)
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`
- `STRIPE_BILLING_PORTAL_RETURN_URL`

Local (test) example paths:

- `STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/billing/success`
- `STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/billing/cancel`
- `STRIPE_BILLING_PORTAL_RETURN_URL=http://localhost:3000/account/billing`
- Optional beta override: `BETA_ALL_ACCESS=true` (treats everyone as Plus during beta).

## Stripe Resources to Create (Test Mode First)

1. Products & Prices
   - Product: Plus — monthly price in USD; trial 7 days; enable tax behavior; statement descriptor set.
   - Product: Pro — monthly price in USD; trial 7 days; enable tax behavior; statement descriptor set.
   - Yearly prices: create but do not expose in env/UI if hiding at launch.
   - Metadata (optional): `tier=plus|pro`.
2. Billing Portal
   - Enable manage/cancel, payment method updates, invoice download.
   - Set return URL (`STRIPE_BILLING_PORTAL_RETURN_URL`).
3. Webhooks (test + live)
   - Events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.
   - Sign with `STRIPE_WEBHOOK_SECRET`.
4. Tax/Compliance
   - Enable Stripe Tax and automatic tax collection.
   - Collect full billing address in Checkout; allow EU VAT IDs if applicable.

## Supabase Schema (via CLI migrations; RLS on all tables)

> Create migrations with `supabase migration new <name>` and apply locally with `supabase migration up` or `supabase db reset` as appropriate.

- `billing_customers`
  - `user_id uuid` PK references `auth.users`
  - `stripe_customer_id text unique not null`
  - `email text`
  - `created_at timestamptz default now()`
  - RLS: owner can select; service role can insert/update.

- `billing_subscriptions`
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid references auth.users`
  - `stripe_subscription_id text unique not null`
  - `stripe_price_id text not null`
  - `stripe_product_id text not null`
  - `tier text check (tier in ('free','plus','pro'))`
  - `status text check (status in ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired'))`
  - `current_period_end timestamptz`
  - `cancel_at_period_end boolean default false`
  - `quantity int default 1`
  - `metadata jsonb`
  - `created_at timestamptz default now()`, `updated_at timestamptz default now()`
  - RLS: owner can select; service role can insert/update.

- `billing_webhook_events`
  - `event_id text primary key`
  - `type text`
  - `payload jsonb`
  - `processed_at timestamptz`
  - `status text`
  - `error text`
  - RLS: service role only (idempotency/audit).

- `feature_flags`
  - `key text primary key`
  - `description text`
  - `min_tier text check (min_tier in ('free','plus','pro'))`
  - `rollout_pct int default 100`
  - `is_enabled boolean default true`
  - RLS: service role admin; reads via server/SSR only for now.

- `feature_overrides` (optional for allowlists/betas)
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid references auth.users`
  - `feature_key text references feature_flags(key)`
  - `force boolean not null`
  - RLS: owner select; service role manage.

Indexes: `billing_subscriptions(user_id)`, `billing_subscriptions(stripe_subscription_id)`, `billing_customers(stripe_customer_id)`, `billing_webhook_events(event_id)`.

## Backend Routes & Services (foundation scope)

- Helpers (TypeScript):
  - `ensureStripeCustomer(user)`: find/create `billing_customers` row and Stripe customer.
  - `mapPriceToTier(priceId)`: allowlist from env; unknown price → error.
  - `upsertSubscriptionFromStripe(stripeSub)`: persist `billing_subscriptions`.
  - `getUserEntitlements(userId)`: returns `{ tier, features }`; supports `BETA_ALL_ACCESS=true` to treat all users as Plus during beta.

- Route Handlers:
  - `POST /api/billing/create-checkout-session`
    - Auth required; input: `priceId`; uses `ensureStripeCustomer`; sets metadata `{ user_id }`; returns session URL.
  - `POST /api/billing/create-portal-session`
    - Auth required; returns Billing Portal URL for existing customer.
  - `POST /api/stripe/webhook`
    - Verify signature with `STRIPE_WEBHOOK_SECRET`.
    - Idempotency via `billing_webhook_events`.
    - Handle events: checkout completion, subscription created/updated/deleted, invoice paid/payment_failed, trial_will_end.
    - Update `billing_customers` and `billing_subscriptions`; on cancel/delete set tier/status and fallback to free.
    - Reject unknown price IDs (spoof protection); do not trust client-selected price.
    - Avoid throwing after responding; log and mark event status instead.

## Entitlements & Feature Flags (designed now, enforced later)

- Effective tier: highest active/trialing subscription (pro > plus > free), else free.
- Feature flag allow: `feature_flags.min_tier <= user tier`, overridden by `feature_overrides.force`.
- SSR preload recommended to avoid flicker; client hook `useFeatureFlag` can consume preloaded entitlements post-foundation.
- Initial feature keys (seed candidates):
  - `identify.unlimited` → min_tier `plus`
  - `lists.unlimited` → min_tier `plus`
  - `lists.upload` → min_tier `plus`
  - `search_party.advanced` → min_tier `plus`
  - `bricklink.byo_key` → min_tier `pro`
  - `mocs.custom` → min_tier `pro`

## Foundation Implementation Steps (to execute)

1. Add env vars (test) for monthly Plus/Pro, webhook secret, success/cancel/portal URLs.
2. Create Supabase migrations for billing tables + RLS policies.
3. Add server helpers and route handlers (`create-checkout-session`, `create-portal-session`, `webhook`), including price allowlist and idempotency.
4. Seed `feature_flags` with initial keys (no enforcement yet).
5. Add tests for price→tier mapping, entitlement resolver, webhook flows (created/updated/canceled).
6. Local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Post-Foundation (not built yet; document for later)

- UI/UX: Account/Billing page showing tier/status/renewal/cancel_at_period_end; Upgrade/Manage CTAs; inline upsells on gated features.
- Feature enforcement: SSR entitlements preload, API guards, client `useFeatureFlag`.
- Pricing expansion: Yearly pricing surfaced in UI when ready; optional multi-currency/localized prices.
- Dunning/notifications: Past_due/unpaid handling, email or in-app banners.
- Advanced tax/localization: per-country price availability if compliance requires.
- Analytics/observability: event logging, latency/failure metrics on webhook handler.

## Testing Checklist

- Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Flows: checkout success/cancel, trial start/end (7 days), payment failure (invoice.payment_failed), cancel_at_period_end, subscription delete.
- Verify DB: `billing_customers` and `billing_subscriptions` reflect Stripe state; idempotency table records events.
- Ensure unknown price IDs are rejected.
- Beta override path: with `BETA_ALL_ACCESS=true`, entitlements should resolve to Plus even without an active subscription (used for beta testing; disable for real gating).

## Ops Runbook (baseline)

- Key rotation: update env for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; restart app.
- Webhook failures: inspect `billing_webhook_events.status/error`; replay via Stripe dashboard if needed.
- Refunds/cancellations: prefer Billing Portal; webhook will set status/tier. Manual overrides should be avoided; if done, reconcile by replaying events.
- Yearly plan visibility: keep yearly price IDs out of env/UI to hide; add env + UI toggle when ready.

## Known Pitfalls to Avoid

- Trusting client price IDs (must be allowlisted).
- Missing idempotency on webhooks (must record `event_id`).
- Throwing after acknowledging webhooks (causes retry storms).
- Skipping RLS on new tables (must enable in migration).
- Mixing test/live keys or webhook secrets across environments.
