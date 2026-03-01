# Stripe Subscriptions — Foundation and Post-Foundation Plan

This document defines the foundational architecture for Stripe subscriptions, along with post-foundation steps for UI enforcement, feature gating, and pricing expansion. Foundation work focuses on schema, backend flows, and operational readiness; post-foundation extends to UX, entitlements enforcement, and rollout controls.

## Snapshot Decisions

- Tiers at launch: **Free and Plus only.** Pro deferred until features warrant it (custom MoCs, instructions uploads, potentially BYO BrickLink key pending BL approval).
- Trial: 14 days for Plus.
- Pricing: Monthly required; yearly supported but can be hidden at launch (omit UI use of yearly price IDs until ready).
- Currency: USD primary. Multi-currency/localized pricing is post-foundation.
- Countries: All Stripe-supported countries allowed.
- Tax/VAT: Enable Stripe Tax and automatic tax collection.
- Coupons/Promos: None at launch.
- Feature placement: Free keeps current features with volume caps; Plus = unlimited everything + sync + part rarity indicators. Lists are specifically labeled user collections of sets; initial gating target is free capped at 3 lists, Plus unlimited. No other "custom lists" concept exists beyond these user set collections.
- **BrickLink pricing is free for all users** — on-demand API calls with ≤6hr server cache. BrickLink API ToS prohibits gating their free-to-members data behind a paywall. Pricing routes must not check entitlements.
- Initial throttles to validate gating: Search Party on free capped at 2 runs/month/user (usage counters), Plus unlimited; lists cap applies to user collections of sets (free up to 3, Plus unlimited).

### Pro Tier (Deferred)

Pro is not offered at launch. Planned Pro-tier features for future consideration:

- Custom MoC uploads (requires storage bucket setup)
- Instructions uploads/linking
- BYO BrickLink API key (pending BrickLink ToS confirmation — contact `apisupport@bricklink.com`)
- Multi-set analysis (combined missing list, "next best set" recommendations)

Pro can be introduced later without schema changes — the `billing_subscriptions.tier` check constraint already includes `'pro'`, and `feature_flags.min_tier` supports it.

## Implementation Status (current)

- Supabase tables + RLS in place: `billing_customers`, `billing_subscriptions`, `billing_webhook_events`, `feature_flags`, `feature_overrides`.
- Server helpers: Stripe client, price allowlist, customer ensure, subscription upsert, entitlements resolver.
- API routes: `POST /api/billing/create-checkout-session`, `POST /api/billing/create-portal-session`, `POST /api/stripe/webhook` (idempotent).
- Pages for flows: `/billing/success`, `/billing/cancel`, `/account` (billing tab).
- Tests: price allowlist/mapping.

## Environment Variables (set for test and live separately)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PLUS_MONTHLY`
- `STRIPE_PRICE_PLUS_YEARLY` (optional; keep unset to hide at launch)
- `STRIPE_CHECKOUT_SUCCESS_URL`
- `STRIPE_CHECKOUT_CANCEL_URL`
- `STRIPE_BILLING_PORTAL_RETURN_URL`

Pro pricing env vars (`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`) — add when Pro tier launches.

Local (test) example paths:

- `STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/billing/success`
- `STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/billing/cancel`
- `STRIPE_BILLING_PORTAL_RETURN_URL=http://localhost:3000/account`

## Stripe Resources to Create (Test Mode First)

1. Products & Prices
   - Product: Plus — monthly price in USD; trial 7 days; enable tax behavior; statement descriptor set.
   - Yearly prices: create but do not expose in env/UI if hiding at launch.
   - Pro product: create when Pro tier launches.
   - Metadata (optional): `tier=plus`.
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
  - `getUserEntitlements(userId)`: returns `{ tier }` based on highest active subscription.

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
- **BrickLink pricing**: No feature flag. Free for all users. Pricing routes must not check entitlements.
- Initial feature keys (seed candidates; seeds aligned via `20251212090000_update_feature_flag_seeds.sql`):
  - `identify.unlimited` → min_tier `plus`
  - `tabs.unlimited` → min_tier `plus` (free capped at 3 open tabs)
  - `lists.unlimited` → min_tier `plus` (user collections of sets; free capped at 3 lists)
  - `exports.unlimited` → min_tier `plus` (free capped at 1/month)
  - `sync.enabled` → min_tier `plus`
  - `search_party.unlimited` → min_tier `plus` (free capped via usage counters)
  - `search_party.advanced` → min_tier `plus` (advanced tools toggled separately)
  - `exclusive_pieces` → min_tier `plus` (part rarity/set-exclusive indicators)
- Removed flags: `prices.detailed` (BL pricing free for all), `pricing.full_cached`, `bricklink.byo_key`, and `mocs.custom` (Pro tier deferred). Migration `20260216053312_delete_stale_feature_flags.sql` deletes these from the DB.
- Planned quantitative limits (to enforce via `usage_counters` + per-tier rules):
  - User lists (set collections): free tier capped at 3 lists; Plus unlimited.
  - Search Party: free tier capped at 2 runs per month per user; Plus unlimited.

## Foundation Implementation Steps (to execute)

1. Add env vars (test) for monthly Plus/Pro, webhook secret, success/cancel/portal URLs.
2. Create Supabase migrations for billing tables + RLS policies.
3. Add server helpers and route handlers (`create-checkout-session`, `create-portal-session`, `webhook`), including price allowlist and idempotency.
4. Seed `feature_flags` with initial keys (no enforcement yet).
5. Add tests for price→tier mapping, entitlement resolver, webhook flows (created/updated/canceled).
6. Local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Post-Foundation (not built yet)

> **Tracking:** See `docs/BACKLOG.md` for consolidated task tracking.

| Task                                              | Priority | Status      |
| ------------------------------------------------- | -------- | ----------- |
| Account/Billing page (tier/status/renewal/cancel) | High     | Done        |
| Upgrade/Manage CTAs                               | High     | Done        |
| Inline upsells on gated features                  | High     | Not started |
| SSR entitlements preload                          | High     | Done        |
| API guards for tier-restricted endpoints          | High     | Not started |
| Client `useFeatureFlag` hook                      | High     | Not started |
| Usage counters enforcement                        | High     | Not started |
| Dunning/notifications (past_due handling)         | Medium   | Done        |
| Yearly pricing UI                                 | Low      | Done        |
| Guest checkout (Stripe-first)                     | High     | Done        |
| Multi-currency/localized pricing                  | Low      | Not started |
| Analytics/observability                           | Low      | Not started |

## Testing Checklist

- Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Flows: checkout success/cancel, trial start/end (14 days), payment failure (invoice.payment_failed), cancel_at_period_end, subscription delete.
- Verify DB: `billing_customers` and `billing_subscriptions` reflect Stripe state; idempotency table records events.
- Ensure unknown price IDs are rejected.

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
