# Stripe Payments & Feature Gating — Launch Checklist

**Last Updated:** 2026-02-26
**Status:** Implementation complete on `feature/feature-gating-billing-ui` branch. This checklist covers remaining manual steps before going live.

## Implementation Summary

See `docs/plans/2026-02-26-feature-gating-billing-ui-design.md` for the full design and `docs/plans/2026-02-26-feature-gating-billing-ui.md` for the implementation plan.

**What's built:**

- SSR-preloaded `EntitlementsProvider` with `useEntitlements()` hook
- Feature gates: tabs (3 free), lists (5 free), identify (5/day), Search Party (2/month), rarity (Plus-only), sync (pull-only for free)
- Shared `UpgradeModal` with per-feature messaging
- Pricing page (`/pricing`) with comparison table and tier-aware CTAs
- Account billing tab with subscription state display + Stripe Portal access
- DunningBanner for `past_due` subscriptions
- 14-day trial for first-time subscribers (no repeat trials)
- Server-side list creation enforcement via `/api/lists` route

---

## Pre-Launch Checklist

### 1. Stripe Configuration

- [ ] **Verify price IDs match env vars** — The `.env.local` price IDs (`price_1SdNbOK4zX1Prn4x5m0MUuxu` for Plus monthly) don't match the IDs returned by the Stripe API (`price_1SdNEQK4zX1Prn4xdKwTRiB4`). Confirm which are correct (test mode vs live mode, or duplicate prices). Update env vars to match.

  | Env Var                     | Current `.env.local` Value       | Stripe API Value                 |
  | --------------------------- | -------------------------------- | -------------------------------- |
  | `STRIPE_PRICE_PLUS_MONTHLY` | `price_1SdNbOK4zX1Prn4x5m0MUuxu` | `price_1SdNEQK4zX1Prn4xdKwTRiB4` |
  | `STRIPE_PRICE_PLUS_YEARLY`  | `price_1SdNgwK4zX1Prn4x5SsYJKdP` | `price_1SdNH5K4zX1Prn4x4v1oI6Me` |

- [ ] **Configure Stripe Billing Portal** — In Stripe Dashboard > Settings > Billing > Customer Portal:
  - Enable subscription cancellation
  - Enable payment method updates
  - Enable invoice history/download
  - Set return URL to your production domain + `/account` (e.g., `https://brickparty.app/account`)

- [ ] **Verify webhook endpoint** — Ensure `POST /api/stripe/webhook` is receiving events:
  - `checkout.session.completed`
  - `customer.subscription.created`, `updated`, `deleted`
  - `invoice.paid`, `invoice.payment_failed`
  - `customer.subscription.trial_will_end`
  - Test locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

- [ ] **Enable Stripe Tax** — In Stripe Dashboard, enable automatic tax collection if not already done. The checkout session has `automatic_tax: { enabled: true }`.

### 2. Environment Variables

- [x] **Beta override removed** — `BETA_ALL_ACCESS` is no longer referenced in code. Remove from any environment configs if still present.

- [x] **Pricing UI enabled** — `NEXT_PUBLIC_PRICING_ENABLED` is no longer referenced in code. Pricing UI is always shown. Remove the env var from any configs if still present.

- [ ] **Verify Stripe keys on Vercel** — Ensure these are set in Vercel production env:
  - `STRIPE_SECRET_KEY` (live key, not test)
  - `STRIPE_WEBHOOK_SECRET` (live webhook secret)
  - `STRIPE_PRICE_PLUS_MONTHLY` (live price ID)
  - `STRIPE_PRICE_PLUS_YEARLY` (optional — omit to hide yearly)
  - `STRIPE_CHECKOUT_SUCCESS_URL` (production domain)
  - `STRIPE_CHECKOUT_CANCEL_URL` (production domain)
  - `STRIPE_BILLING_PORTAL_RETURN_URL` (production domain + `/account`)

### 3. Cleanup

- [x] **`/account/billing` redirects to `/account`** — The beta placeholder page now redirects to the account page where the Billing tab lives.

- [x] **`STRIPE_BILLING_PORTAL_RETURN_URL` updated** — Now points to `/account`. Update for production domain when deploying.

### 4. Supabase

- [ ] **Apply feature flag migration** — Run the migration that seeds `tabs.unlimited` and `rarity.enabled` on the production database:

  ```bash
  supabase db push
  ```

- [ ] **Verify RLS on billing tables** — Confirm `billing_subscriptions` allows owner-select (the SSR preload and account page query depend on this).

### 5. E2E Testing (Stripe Test Mode)

Before switching to live keys, run through these flows with Stripe test cards:

- [ ] **Free user experience**
  - Sign in with no subscription
  - Verify all limits enforced: 3 tabs, 5 lists, 5 identifies/day, 2 Search Party/month
  - Verify rarity controls show "(Plus)" label and trigger upgrade modal
  - Verify sync is pull-only (no push to Supabase)
  - Verify upgrade modals appear with correct messaging

- [ ] **Checkout flow**
  - From `/pricing`, click "Start 14-day free trial"
  - Complete Stripe Checkout with test card `4242 4242 4242 4242`
  - Verify redirect to `/billing/success` with correct messaging
  - Verify subscription created in `billing_subscriptions` (status: `trialing`, tier: `plus`)
  - Verify all Plus features now unlocked

- [ ] **Trial-to-active transition**
  - Use Stripe Dashboard to advance clock past trial period
  - Verify subscription moves to `active`
  - Verify features remain unlocked

- [ ] **Payment failure flow**
  - Use test card `4000 0000 0000 0341` (attaches but fails on charge)
  - Verify subscription moves to `past_due`
  - Verify DunningBanner appears on next page load
  - Verify Plus features remain active during grace period
  - Use Stripe Dashboard to resolve → verify banner disappears

- [ ] **Cancellation flow**
  - Click "Manage Subscription" on Account > Billing tab
  - Cancel via Stripe Portal
  - Verify `cancel_at_period_end` shows on billing tab ("Your Brick Party Plus subscription ends on [date]")
  - Use Stripe Dashboard to advance to period end
  - Verify downgrade to free tier

- [ ] **Resubscribe flow (no repeat trial)**
  - After cancellation, visit `/pricing`
  - Verify CTA says "Get Plus" (not "Start 14-day free trial")
  - Complete checkout → verify no trial period applied

- [ ] **Account billing tab states**
  - Free (no subscription): "Free Plan" badge + upgrade CTA
  - Trialing: "Plus (Trial)" badge + trial end date + manage button
  - Active: "Plus" badge + renewal date + manage button
  - Past Due: warning + update payment button
  - Canceled: ended date + resubscribe CTA

### 6. Post-Launch Monitoring

- [ ] **Monitor webhook delivery** — Check Stripe Dashboard > Webhooks for failed deliveries
- [ ] **Monitor `billing_webhook_events`** — Query for `status = 'error'` rows
- [ ] **Verify entitlements cache** — The LRU cache (5min TTL, 1000 entries) should handle normal load. Monitor for stale entitlements if users report issues after checkout.

---

## Architecture Reference

```
Provider Hierarchy:
  AuthProvider (initialUser)
    → EntitlementsProvider (initialEntitlements)  ← SSR preloaded
      → SyncProvider (reads entitlements for sync mode)
        → ThemeProvider
          → ReactQueryProvider
            → children

Feature Gate Pattern:
  Client: useEntitlements() → hasFeature(key) → show UpgradeModal if blocked
  Server: getEntitlements(userId) → hasFeature(entitlements, key) → return 403

Checkout Flow:
  /pricing → POST /api/billing/create-checkout-session → Stripe Checkout
    → /billing/success (webhook upserts subscription) → SSR refreshes entitlements

Dunning:
  invoice.payment_failed webhook → status: past_due → DunningBanner on next load
  Stripe Smart Retries (~3 weeks) → recovered or canceled
```

## Related Docs

- `docs/plans/2026-02-26-feature-gating-billing-ui-design.md` — Full design document
- `docs/plans/2026-02-26-feature-gating-billing-ui.md` — Implementation plan
- `docs/billing/stripe-subscriptions.md` — Stripe foundation spec
- `docs/BACKLOG.md` — Groups B + C items
