# Feature Gating + Billing UI Design

**Date:** 2026-02-26
**Scope:** Groups B + C from BACKLOG.md — entitlements delivery, feature gate enforcement, billing UI, pricing page, dunning

## Decisions

- **Tiers:** Free + Plus only. Pro deferred (schema supports it for later).
- **Trial:** 14-day with card upfront (Stripe Checkout collects payment method).
- **Pricing:** Plus at $8/mo, $80/yr. Yearly hidden at launch.
- **Exports:** Ungated for all users. Manual export/import friction is the natural upsell for cloud sync.
- **Trial ending:** No notification. Card is on file, transition to active is seamless.
- **Dunning:** Grace period with persistent banner during `past_due`. Plus features stay active until Stripe moves to `canceled`/`unpaid`.

## Feature Limits

| Feature              | Free                                    | Plus               |
| -------------------- | --------------------------------------- | ------------------ |
| Search & browse sets | Unlimited                               | Unlimited          |
| Track owned pieces   | Unlimited                               | Unlimited          |
| BrickLink pricing    | Included                                | Included           |
| Export to CSV        | Unlimited                               | Unlimited          |
| Open tabs            | 3                                       | Unlimited          |
| Custom lists         | 5                                       | Unlimited          |
| Identify parts       | 5/day                                   | Unlimited          |
| Host Search Party    | 2/month                                 | Unlimited          |
| Part rarity insights | No (visible but disabled, Plus label)   | Yes                |
| Cloud sync           | Pull-only (read from Supabase, no push) | Full bidirectional |

## Architecture: Entitlements Delivery (SSR Preload + Context)

### Approach

Preload entitlements in root layout server component, pass to a client `EntitlementsProvider`. No client-side refetching — entitlements refresh on every full page load (navigation, checkout return, auth change).

### Provider Hierarchy

```
AuthProvider (initialUser, initialHandle)
  → EntitlementsProvider (initialEntitlements)     ← NEW
    → SyncProvider
      → ThemeProvider
        → ReactQueryProvider
          → children
```

### Root Layout Change

After fetching the user in `app/layout.tsx`, call `getEntitlements(user.id)` server-side. Pass result as `initialEntitlements` to `EntitlementsProvider`. Anon users get `null`.

### EntitlementsProvider

File: `app/components/providers/entitlements-provider.tsx`

- Props: `{ initialEntitlements: Entitlements | null }`
- Hook: `useEntitlements()` returns `{ tier, features, hasFeature(key): boolean, isPlus: boolean }`
- Anon/free defaults: `{ tier: 'free', features: [], hasFeature: () => false, isPlus: false }`

### API Route Guards

API routes continue calling `getEntitlements()` server-side independently. They don't rely on client context.

## Feature Gate Enforcement

All gates follow the same pattern: check entitlements → if not allowed, show `<UpgradeModal>`.

### Tabs (client-side gate)

`open-tabs.ts` currently has no limit (was 10, recently removed). Add a dynamic limit: `openTab()` checks `hasFeature('tabs.unlimited')` — if false, cap at 3. Component that calls `openTab()` checks entitlements and shows upgrade modal if at limit.

### Lists (API + client gate)

API route: count existing lists for user → if >= 5 and no `lists.unlimited`, return 403.
Client: "New List" button pre-checks and shows modal directly to avoid round trip.

### Identify (already enforced)

Route already gates at 5/day. Wire up upgrade modal on 403 response (currently may show generic error).

### Search Party (already enforced)

Route already gates at 2/month. Wire up upgrade modal on 403 response.

### Rarity (client-side gate)

Rarity filter/sort options remain visible with a "Plus" label. Clicking triggers upgrade modal instead of applying filter. No API gate needed.

### Sync (client-side gate)

`SyncWorker` checks entitlements at initialization:

- Free: pull-only mode (download from Supabase, don't push)
- Plus: full bidirectional sync

On downgrade, existing Supabase data stays — user just stops pushing new changes.

### Shared UpgradeModal

File: `app/components/upgrade-modal.tsx`

Reusable across all gates. Props include `feature` to customize message per gate.

- Header: "Upgrade to Plus"
- Context line (e.g., "You've reached the free limit of 3 open tabs")
- 3-4 key Plus benefits
- "View Plans" button → `/pricing`
- "Maybe Later" dismiss

Modal sends users to `/pricing` rather than directly to Checkout.

## Pricing Page

### Route: `/pricing` (public)

Accessible to both unauthenticated and authenticated users.

### Feature Comparison Table

| Feature              | Free      | Plus ($8/mo) |
| -------------------- | --------- | ------------ |
| Search & browse sets | Unlimited | Unlimited    |
| Track owned pieces   | Unlimited | Unlimited    |
| BrickLink pricing    | Included  | Included     |
| Export to CSV        | Unlimited | Unlimited    |
| Open tabs            | 3         | Unlimited    |
| Custom lists         | 5         | Unlimited    |
| Identify parts       | 5/day     | Unlimited    |
| Host Search Party    | 2/month   | Unlimited    |
| Part rarity insights | —         | Included     |
| Cloud sync           | —         | Included     |

### CTA Logic by User State

| State                | CTAs                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Not signed in        | "Sign up free" → auth flow + "Get more with Plus" → auth then `/pricing` |
| Free, signed in      | "Start 14-day free trial" → Stripe Checkout                              |
| Trialing/Active Plus | "Current plan" (no action)                                               |
| Canceled/Past Due    | "Resubscribe" → Stripe Checkout                                          |

## Account Billing Tab

New 5th tab in existing account page (`AccountPageClient.tsx`).

### Display by Subscription State

| State                  | Display                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Free (no subscription) | "Free Plan" badge, "Upgrade to Plus" CTA → `/pricing`                                                    |
| Trialing               | "Plus (Trial)" badge, trial end date, "Manage Subscription" → Stripe Portal                              |
| Active                 | "Plus" badge, renewal date, cancel note if `cancel_at_period_end`, "Manage Subscription" → Stripe Portal |
| Past Due               | "Plus" badge + warning: "Payment failed — update payment method", "Update Payment" → Stripe Portal       |
| Canceled               | "Free Plan" badge, "Your Brick Party Plus subscription ended on [date]", "Resubscribe" → `/pricing`      |

### Data Source

SSR preloads subscription details (renewal date, cancel status, trial end) by querying `billing_subscriptions` in the account page server component. Passed down as `initialSubscription`.

Stripe Portal handles payment method updates, cancellation, and invoice history via existing `POST /api/billing/create-portal-session` route.

## Dunning (Past Due Handling)

### Persistent Banner

Top-of-page warning bar rendered in root layout, below nav. Not dismissable.

- Text: "Your payment failed — update your payment method to keep Plus features."
- CTA: "Update Payment" → Stripe Portal
- Shown when subscription status is `past_due`

### Feature Access During Past Due

Plus features remain active during Stripe's Smart Retry window (~3 weeks). If subscription moves to `canceled`/`unpaid` via webhook, user downgrades to free on next page load.

### Data Source

Subscription status passed from SSR as a separate prop (not part of entitlements). `<DunningBanner>` component in layout reads this.

## Checkout Flow (End to End)

### Upgrade Path

1. Free user hits gate → `<UpgradeModal>` with context
2. "View Plans" → `/pricing`
3. "Start 14-day free trial" → `POST /api/billing/create-checkout-session` (Plus monthly price)
4. Checkout creates session with `trial_period_days: 14`, card collection, automatic tax
5. Stripe Checkout → redirect to `/billing/success`
6. Webhook: `checkout.session.completed` → upsert subscription (trialing, plus)
7. `/billing/success` SSR → fresh entitlements → user is Plus

### Cancellation

1. Account → Billing tab → "Manage Subscription" → Stripe Portal → cancel
2. Webhook: sets `cancel_at_period_end: true`
3. Account billing tab: "Your Brick Party Plus subscription ends on [date]"
4. At period end: `customer.subscription.deleted` → webhook sets tier free
5. Next page load → free tier

### Payment Failure

1. `invoice.payment_failed` → webhook sets `past_due`
2. Next page load → dunning banner, Plus features remain
3. Stripe Smart Retries over ~3 weeks
4. Recovered: `invoice.paid` → clears past_due
5. Not recovered: `canceled` → free tier

### Backend Change

Add `trial_period_days: 14` to checkout session creation in `app/api/billing/create-checkout-session/route.ts`. No other webhook or backend changes needed — existing handler covers all events.

## What Already Exists (No Changes Needed)

- Supabase billing schema (customers, subscriptions, webhook events, feature flags, overrides, usage counters)
- Stripe webhook handler (idempotent, handles all subscription lifecycle events)
- Entitlements resolver with LRU cache + beta override
- Usage counter service with atomic increment
- Identify route quota enforcement (5/day)
- Search Party route quota enforcement (2/month)
- Checkout and portal session routes
- Price allowlist and tier mapping

## New Files

| File                                                 | Purpose                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `app/components/providers/entitlements-provider.tsx` | SSR-preloaded entitlements context + `useEntitlements()` hook |
| `app/components/upgrade-modal.tsx`                   | Shared gate modal with per-feature messaging                  |
| `app/components/dunning-banner.tsx`                  | Persistent payment failure banner                             |
| `app/(app)/pricing/page.tsx`                         | Public pricing page with comparison table                     |
| `app/account/components/BillingTab.tsx`              | Account billing tab                                           |

## Modified Files

| File                                               | Change                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `app/layout.tsx`                                   | SSR entitlements preload, add `EntitlementsProvider` to hierarchy, add `DunningBanner` |
| `app/api/billing/create-checkout-session/route.ts` | Add `trial_period_days: 14`                                                            |
| `app/store/open-tabs.ts`                           | Dynamic tab limit based on entitlements (3 for free)                                   |
| `app/account/components/AccountPageClient.tsx`     | Add Billing tab                                                                        |
| Components using rarity filter/sort                | Add Plus label, gate with upgrade modal                                                |
| Components calling identify/search party           | Handle 403 with upgrade modal instead of generic error                                 |
| `app/lib/sync/SyncWorker.ts`                       | Check entitlements, pull-only mode for free tier                                       |
| List creation route/component                      | Add list count enforcement                                                             |
