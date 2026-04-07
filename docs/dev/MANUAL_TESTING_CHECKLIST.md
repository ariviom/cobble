# Manual Testing Checklist

Test each section across three user states: **Unauthenticated**, **Free** (signed in, no subscription), and **Plus** (active subscription).

Use Stripe test cards for checkout flows: `4242 4242 4242 4242` (success), `4000 0000 0000 0341` (payment failure).

---

## Unauthenticated Baseline

Unauth users can browse but not track anything or use features that require tracking.

- [x] Can search for sets
- [x] Can view set inventories
- [x] Cannot mark owned quantities (prompted to sign in)
- [x] Cannot create lists, identify parts, or host Search Party
- [x] Cannot access collection or account pages

## Tabs

- [x] **Free**: Can open 3 set tabs
- [x] **Free**: 4th tab triggers UpgradeModal with message about 3-tab limit
- [x] **Free**: Closing a tab and opening a new one succeeds (back to 3)
- [x] **Plus**: Can open 10+ tabs without restriction

## Lists

- [x] **Free**: Can create 5 custom lists
- [x] **Free**: 6th list triggers UpgradeModal (client-side) and is rejected by API (403)
- [x] **Free**: System lists (Owned, Wanted, etc.) don't count toward limit
- [x] **Plus**: Can create unlimited custom lists

## Identification

- [x] **Free**: Quota endpoint shows `remaining: 5` at start of day
- [x] **Free**: Can identify 5 parts successfully
- [x] **Free**: 6th identify returns 429 with quota exceeded message
- [x] **Free**: Quota resets the next day
- [x] **Plus**: Quota endpoint shows unlimited
- [x] **Plus**: Can identify without limit

## Search Party

- [x] **Free**: Quota shows 2 sessions remaining
- [x] **Free**: Can host 2 sessions
- [x] **Free**: 3rd host attempt returns 429 with quota exceeded
- [x] **Free**: Quota shows reset date
- [x] **Free**: Can still join sessions hosted by others
- [x] **Plus**: Quota shows unlimited
- [x] **Plus**: Can host without limit

## Rarity

- [x] **Free**: No rarity badges on inventory items
- [x] **Free**: No rarity filter/sort options in inventory controls
- [x] **Plus**: Rarity badges visible (Exclusive, Very Rare, Rare)
- [x] **Plus**: Can filter and sort by rarity

## Cloud Sync

- [ ] **Free**: Local changes persist in IndexedDB across refreshes
- [ ] **Free**: Changes do NOT push to Supabase (pull-only mode)
- [ ] **Plus**: Changes sync to Supabase within seconds
- [ ] **Plus**: Changes appear on a different device/browser after sync
- [ ] **Upgrade**: After subscribing, pending local changes push to cloud

## List Builder / Collection Export

- [ ] **Free**: Export/list builder actions trigger UpgradeModal
- [ ] **Plus**: Can build custom parts lists from collection
- [ ] **Plus**: Can export to Rebrickable CSV, BrickLink wanted list, Pick-a-Brick

## Pricing Page (`/pricing`)

- [s] **Unauth**: Shows comparison table, CTA says "Start 14-day free trial"
- [s] **Free**: Same as unauth but with sign-in context
- [s] **Plus**: CTA changes to reflect current subscription state
- [s] **Returning** (previously subscribed): CTA says "Get Plus" (not "Start trial")

## Checkout Flow

- [x] **Free → Plus**: Click trial CTA → Stripe Checkout → complete with test card
- [x] Redirect to `/billing/success` with correct messaging
- [x] Subscription appears in account billing tab (status: `trialing`)
- [x] All Plus features unlock immediately
- [x] Promo code: redeem `BRICKPARTYBETA` from billing tab → subscription created

## Account / Billing Tab

- [x] **Free**: Shows "Free Plan" badge, promo code input, upgrade CTA
- [x] **Trialing**: Shows "Plus (Trial)" badge, trial end date, "Manage Subscription" button
- [x] **Active**: Shows "Plus" badge, renewal date, "Manage Subscription" button
- [x] **Past Due**: Warning alert with "Update Payment" link to Stripe portal
- [x] **Canceled**: Shows ended date, resubscribe CTA

## Dunning Banner

- [x] **Past Due**: DunningBanner appears at top of page (use test card `4000 0000 0000 0341`)
- [x] Clicking "Update Payment" opens Stripe billing portal
- [x] After resolving payment, banner disappears on next page load

## Cancellation & Resubscribe

- [x] Cancel via Stripe Portal from account page
- [x] Billing tab shows "ends on [date]" with `cancel_at_period_end`
- [x] After period ends, user downgrades to free (all limits re-enforced)
- [x] Resubscribe: no trial offered, CTA says "Get Plus"

## Guest Checkout (Unauthenticated → Plus)

- [ ] Start checkout without signing in
- [ ] Complete with new email → user auto-created, subscription active
- [ ] Complete with existing email → linked to existing account

## Billing Portal

- [x] "Manage Subscription" opens Stripe portal
- [x] Can update payment method
- [x] Can cancel subscription
- [x] Can view invoice history
- [x] Portal returns to `/account` after completion
