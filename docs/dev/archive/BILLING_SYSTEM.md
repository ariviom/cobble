# Billing System

Technical reference for the Stripe-based subscription billing system. Covers checkout flows, webhook processing, entitlements resolution, and key implementation details.

## Architecture Overview

```
Provider Hierarchy (app/layout.tsx):
  AuthProvider (initialUser)
    → EntitlementsProvider (initialEntitlements)  ← SSR preloaded
      → SyncProvider (reads entitlements for sync mode)
        → ThemeProvider
          → ReactQueryProvider
            → children
```

**Tiers:** Free and Plus. Pro tier is schema-ready but deferred.

**Pricing:** $8/month or $80/year (2 months free). 14-day trial for first-time subscribers.

**Key constraint:** BrickLink pricing data is free for all users (BL ToS). Pricing routes must never check entitlements.

## Key Files

| File                                                 | Purpose                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `app/lib/services/billing.ts`                        | Core billing service — price allowlist, customer management, subscription upsert, user entitlements query |
| `app/lib/services/entitlements.ts`                   | Feature flag resolution, LRU cache, `getEntitlements()`                                                   |
| `app/api/billing/create-checkout-session/route.ts`   | Authenticated checkout (CSRF-protected)                                                                   |
| `app/api/billing/guest-checkout/route.ts`            | Unauthenticated checkout (IP rate-limited)                                                                |
| `app/api/billing/create-portal-session/route.ts`     | Stripe Billing Portal redirect (CSRF-protected)                                                           |
| `app/api/stripe/webhook/route.ts`                    | Webhook handler — signature verification, idempotency, event processing                                   |
| `app/components/providers/entitlements-provider.tsx` | Client-side React context for entitlements                                                                |
| `app/hooks/usePortalSession.ts`                      | Shared hook for opening Stripe Billing Portal                                                             |
| `app/components/dunning-banner.tsx`                  | Past-due payment warning banner                                                                           |
| `app/layout.tsx`                                     | SSR entitlements preload + provider hierarchy                                                             |
| `app/lib/stripe/client.ts`                           | Stripe SDK initialization                                                                                 |

## Database Tables

All tables have RLS enabled. Service role client used for billing operations.

**`billing_customers`** — Maps Supabase users to Stripe customers.

- `user_id` (PK, references auth.users), `stripe_customer_id` (unique), `email`, `created_at`

**`billing_subscriptions`** — Mirrors Stripe subscription state.

- `stripe_subscription_id` (unique), `user_id`, `stripe_price_id`, `stripe_product_id`
- `tier` (free/plus/pro), `status` (active/trialing/past_due/canceled/unpaid/incomplete/incomplete_expired/paused)
- `current_period_end`, `cancel_at_period_end`, `quantity`, `metadata`, timestamps

**`billing_webhook_events`** — Idempotency table for webhook deduplication.

- `event_id` (PK — Stripe event ID), `type`, `payload` (jsonb), `processed_at`, `status`, `error`, `created_at`

**`feature_flags`** — Feature gates with tier requirements.

- `key` (PK), `description`, `min_tier` (free/plus/pro), `rollout_pct`, `is_enabled`

**`feature_overrides`** — Per-user flag overrides for beta access or manual grants.

- `user_id`, `feature_key` (references feature_flags), `force` (boolean)

## Checkout Flows

### Authenticated Checkout

`POST /api/billing/create-checkout-session`

1. CSRF validation via Origin header
2. Auth check — requires signed-in user
3. Price ID validated against allowlist (`mapPriceToTier`)
4. `ensureStripeCustomer` — finds or creates billing_customers row + Stripe customer (idempotent via `idempotencyKey: create-customer-${user.id}`)
5. Checks for prior subscription to determine trial eligibility
6. Creates Stripe Checkout Session:
   - `mode: 'subscription'`, `customer: customerId`
   - `subscription_data.trial_period_days: 14` only if no prior subscription
   - `subscription_data.metadata: { user_id }` for webhook resolution
   - `automatic_tax: { enabled: true }`
7. Returns session URL → client redirects to Stripe Checkout

### Guest Checkout

`POST /api/billing/guest-checkout`

No CSRF protection (no session to protect). IP-based rate limiting instead (5 requests/minute per IP).

1. IP rate limit check via `consumeRateLimit`
2. Price ID validated against allowlist
3. Creates Stripe Checkout Session:
   - `customer_creation: 'always'` — Stripe creates a new customer
   - `subscription_data.trial_period_days: 14` always (user identity unknown at this point)
   - `subscription_data.metadata: { guest: 'true' }` — flags for webhook handling
   - No `customer` field (no existing Stripe customer to attach)
4. Returns session URL

**Guest user resolution** happens later in the webhook (see below).

### Post-Checkout Pages

- `/billing/success` — Confirmation page. Authenticated users see "You're all set." Unauthenticated users see "Sign in to start using Plus. If you're new, check your email for an invite link."
- `/billing/cancel` — User backed out of checkout. Links to `/sets`.

## Webhook Processing

`POST /api/stripe/webhook` — handles all Stripe webhook events.

### Signature Verification

Raw body + `stripe-signature` header verified against `STRIPE_WEBHOOK_SECRET`. Invalid signatures return 400.

### Idempotency

`recordEventIfNew` provides three-state idempotency:

1. **`new`** — First time seeing this event. Inserts with `status: 'pending'` via atomic upsert (`ON CONFLICT ... ignoreDuplicates`).
2. **`existing`** — Already processed successfully. Returns early (200 to Stripe, no reprocessing).
3. **`reprocess`** — Previously recorded as `error` or `deferred`. Allows retry.

### Event Handling

| Event                                  | Handler                   | Action                                                                                 |
| -------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `checkout.session.completed`           | `handleCheckoutCompleted` | Resolves user, links customer, upserts subscription, cancels trial for returning users |
| `customer.subscription.created`        | `handleSubscriptionEvent` | Upserts subscription record                                                            |
| `customer.subscription.updated`        | `handleSubscriptionEvent` | Upserts subscription record (status changes, renewals)                                 |
| `customer.subscription.deleted`        | `handleSubscriptionEvent` | Upserts with canceled status → tier resolves to free                                   |
| `invoice.paid`                         | (no-op)                   | Reserved for future notifications                                                      |
| `invoice.payment_failed`               | (no-op)                   | Status change handled by subscription.updated                                          |
| `customer.subscription.trial_will_end` | (no-op)                   | Reserved for future trial-ending notifications                                         |

### Error Handling

- Processing errors: recorded as `status: 'error'` in webhook events table, returns **500** to Stripe so it retries.
- Deferred events: recorded as `status: 'deferred'`, returns 200 (Stripe will retry deferred events naturally when the checkout completes and fires subscription.updated).
- Successfully processed: recorded as `status: 'ok'`.

### Guest User Resolution in `handleCheckoutCompleted`

Three-step resolution for the checkout session's user:

1. **Metadata** — `session.metadata.user_id` (set by authenticated checkout)
2. **Customer lookup** — `getUserIdForCustomer(stripeCustomerId)` checks billing_customers table
3. **Email-based** (guest only) — `resolveGuestCheckoutUser(email)`:
   - Searches Supabase auth users via GoTrue admin REST API (`/auth/v1/admin/users?filter=email`)
   - If found: returns existing user ID
   - If not found: invites via `supabase.auth.admin.inviteUserByEmail` → creates user immediately + sends invite email
   - Race condition handling: if invite fails with "already been registered", retries lookup

After resolution, the customer record is upserted to link the Stripe customer to the Supabase user.

### Deferred Subscription Events

Guest checkout creates a race condition: `subscription.created` often arrives before `checkout.session.completed` has linked the guest user. When `handleSubscriptionEvent` fails to resolve the user for a guest subscription (`metadata.guest === 'true'`), it returns `'deferred'` instead of throwing. The event is recorded with `status: 'deferred'`.

The `checkout.session.completed` handler processes the subscription directly after resolving the user, so the deferred event is effectively handled. If Stripe retries the subscription event, `recordEventIfNew` allows reprocessing of deferred events.

## Trial Abuse Prevention

Two layers prevent users from getting multiple free trials:

1. **Authenticated checkout** — Queries `billing_subscriptions` for the user. If any prior subscription exists, `trial_period_days` is omitted from the checkout session.

2. **Guest checkout webhook** — Guest checkout always includes `trial_period_days: 14` because user identity isn't known at checkout time. In `handleCheckoutCompleted`, after resolving the user:
   - Checks if the subscription has a trial (`subscription.trial_end`)
   - Queries for prior subscriptions for this user (excluding the current one)
   - If found: calls `stripe.subscriptions.update(subId, { trial_end: 'now' })` to end the trial immediately
   - Logs `billing.trial_canceled_returning_user`

## Entitlements Resolution

### Server-Side: `getEntitlements(userId)`

`app/lib/services/entitlements.ts`

1. Check LRU cache (max 1000 entries, 5-minute TTL)
2. If miss: query `billing_subscriptions` for user → determine tier from highest active subscription
3. Load `feature_flags` table
4. Load `feature_overrides` for user
5. For each flag: check override → check tier eligibility → check rollout percentage (deterministic hash)
6. Return `{ tier, features, featureFlagsByKey }`
7. Cache result

**Tier determination** (`getUserEntitlements` in billing.ts):

- Active statuses: `active`, `trialing`, `past_due` (grace period)
- Cancel-to-free statuses: `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`
- If multiple subscriptions exist, highest tier wins (`pro > plus > free`)

**Cache invalidation:** `invalidateEntitlements(userId)` is called from webhook handlers after subscription changes. Next request fetches fresh data from DB.

### Client-Side: `EntitlementsProvider` + `useEntitlements()`

`app/components/providers/entitlements-provider.tsx`

SSR preloads entitlements in `layout.tsx`:

```
const fullEntitlements = await getEntitlements(user.id);
initialEntitlements = { tier, features };  // strips featureFlagsByKey
```

Only `ClientEntitlements` (`{ tier, features }`) is passed to the client. The full `Entitlements` type (including `featureFlagsByKey` with flag names, min tiers, rollout percentages) is server-only to avoid leaking configuration.

The `useEntitlements()` hook provides:

- `tier` — current tier string
- `features` — array of feature key strings
- `isPlus` — boolean (tier is `plus` or `pro`)
- `hasFeature(key)` — checks feature set membership

Unauthenticated users get `FREE_DEFAULTS`: tier `free`, no features.

### Feature Flags (Current Seeds)

| Key                      | Min Tier | Description                            |
| ------------------------ | -------- | -------------------------------------- |
| `identify.unlimited`     | plus     | Unlimited part identification          |
| `tabs.unlimited`         | plus     | Unlimited open tabs (free: 3)          |
| `lists.unlimited`        | plus     | Unlimited set lists (free: 5)          |
| `exports.unlimited`      | plus     | Unlimited exports (free: 1/month)      |
| `sync.enabled`           | plus     | Full sync (free: pull-only)            |
| `search_party.unlimited` | plus     | Unlimited Search Party (free: 2/month) |
| `search_party.advanced`  | plus     | Advanced Search Party tools            |
| `exclusive_pieces`       | plus     | Part rarity/set-exclusive indicators   |
| `rarity.enabled`         | plus     | Rarity controls                        |

## Subscription State Machine

```
                    checkout
                   ┌────────┐
                   │trialing│──── trial ends ────► active
                   └────┬───┘                      │
                        │                          │
                   payment fails              payment fails
                        │                          │
                        ▼                          ▼
                    canceled                    past_due
                                                   │
                                              ┌────┴────┐
                                         recovered    exhausted
                                              │         │
                                              ▼         ▼
                                           active    canceled
```

**Status → Tier mapping:**

- `active`, `trialing`, `past_due` → subscription tier (plus)
- `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused` → free

**Grace period:** `past_due` users keep Plus features while Stripe Smart Retries attempt payment recovery (~3 weeks). The `DunningBanner` component shows a warning with an "Update Payment" button that opens the Stripe Billing Portal.

## Stripe Billing Portal

`POST /api/billing/create-portal-session` — CSRF-protected, auth-required.

Creates a Stripe Billing Portal session for the authenticated user. Used for:

- Updating payment methods
- Canceling subscriptions
- Viewing invoice history

The `usePortalSession` hook (`app/hooks/usePortalSession.ts`) provides a shared `openPortal` function used by `DunningBanner`, `BillingTab`, and `PricingSection`.

## Pricing Page

`/pricing` — accessible to both authenticated and unauthenticated users.

**Unauthenticated:** Shows pricing comparison with "Start 14-day free trial" CTA → guest checkout.
**Authenticated (free):** Shows "Start 14-day free trial" (or "Get Plus" if returning user) → authenticated checkout.
**Authenticated (past_due):** Shows "Update Payment" → opens Billing Portal.
**Authenticated (canceled):** Shows "Get Plus" → new authenticated checkout (no trial).
**Authenticated (active/trialing):** Shows "Current Plan" badge.

Monthly/annual toggle uses `SegmentedControl`. Toggle only visible when `STRIPE_PRICE_PLUS_YEARLY` env var is set.

## Security

- **CSRF:** Authenticated billing endpoints use Origin header validation via `withCsrfProtection`
- **Price validation:** All price IDs validated against server-side allowlist (`mapPriceToTier`). Unknown prices rejected.
- **Webhook signature:** Stripe signature verification via `STRIPE_WEBHOOK_SECRET`
- **Rate limiting:** Guest checkout rate-limited to 5 requests/minute per IP
- **Data isolation:** `ClientEntitlements` type prevents leaking feature flag config (min_tier, rollout_pct) to client
- **RLS:** All billing tables have row-level security. Owner can select; service role can insert/update.
- **Email masking:** `maskEmail()` used in all log output to protect PII

## Environment Variables

| Variable                           | Required | Description                                                  |
| ---------------------------------- | -------- | ------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`                | Yes      | Stripe API secret key                                        |
| `STRIPE_WEBHOOK_SECRET`            | Yes      | Webhook signature verification secret                        |
| `STRIPE_PRICE_PLUS_MONTHLY`        | Yes      | Stripe price ID for Plus monthly                             |
| `STRIPE_PRICE_PLUS_YEARLY`         | No       | Stripe price ID for Plus yearly (omit to hide annual option) |
| `STRIPE_CHECKOUT_SUCCESS_URL`      | Yes      | Redirect URL after successful checkout                       |
| `STRIPE_CHECKOUT_CANCEL_URL`       | Yes      | Redirect URL after canceled checkout                         |
| `STRIPE_BILLING_PORTAL_RETURN_URL` | Yes      | Return URL from Stripe Billing Portal (should be `/account`) |

## Logging Events

All billing operations log structured events via `logger` from `@/lib/metrics`:

| Event                                         | Level | When                                                    |
| --------------------------------------------- | ----- | ------------------------------------------------------- |
| `billing.create_checkout_session_failed`      | error | Checkout session creation fails                         |
| `billing.guest_checkout_failed`               | error | Guest checkout session creation fails                   |
| `billing.create_portal_session_failed`        | error | Portal session creation fails                           |
| `billing.webhook_signature_failed`            | warn  | Invalid webhook signature                               |
| `billing.webhook_reprocessing_event`          | info  | Retrying a previously failed/deferred event             |
| `billing.webhook_processing_failed`           | error | Event handler throws                                    |
| `billing.webhook_guest_subscription_deferred` | warn  | Guest subscription event deferred (user not yet linked) |
| `billing.webhook_unhandled_event`             | info  | Received unsubscribed event type                        |
| `billing.webhook_record_failed`               | error | Failed to insert idempotency record                     |
| `billing.trial_canceled_returning_user`       | info  | Trial canceled for returning guest checkout user        |
| `billing.guest_user_resolved_existing`        | info  | Guest email matched existing Supabase user              |
| `billing.guest_user_invited`                  | info  | New user created via invite for guest checkout          |
| `billing.guest_invite_failed`                 | error | Failed to invite guest user                             |
| `billing.guest_invite_race_condition`         | info  | Concurrent invite resolved via retry lookup             |
| `billing.customer_lookup_failed`              | error | billing_customers query failed                          |
| `billing.entitlements_query_failed`           | error | billing_subscriptions query failed                      |
| `billing.missing_current_period_end`          | warn  | Stripe subscription missing current_period_end          |
| `billing.find_user_missing_env`               | error | Missing Supabase URL or service role key                |
| `billing.find_user_rest_failed`               | error | GoTrue admin API returned error                         |
| `billing.find_user_request_failed`            | error | GoTrue admin API request threw                          |
| `entitlements.flags_load_failed`              | error | feature_flags query failed                              |
| `entitlements.overrides_load_failed`          | error | feature_overrides query failed                          |

## Related Docs

- `docs/billing/stripe-subscriptions.md` — Original Stripe foundation spec
- `docs/dev/STRIPE_GATING_LAUNCH_CHECKLIST.md` — Pre-launch checklist
- `docs/plans/2026-02-26-feature-gating-billing-ui-design.md` — Feature gating design
