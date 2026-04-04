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
- [ ] Cannot access collection or account pages

## Tabs

- [ ] **Free**: Can open 3 set tabs
- [ ] **Free**: 4th tab triggers UpgradeModal with message about 3-tab limit
- [ ] **Free**: Closing a tab and opening a new one succeeds (back to 3)
- [ ] **Plus**: Can open 10+ tabs without restriction

## Lists

- [ ] **Free**: Can create 5 custom lists
- [ ] **Free**: 6th list triggers UpgradeModal (client-side) and is rejected by API (403)
- [ ] **Free**: System lists (Owned, Wanted, etc.) don't count toward limit
- [ ] **Plus**: Can create unlimited custom lists

## Identification

- [ ] **Free**: Quota endpoint shows `remaining: 5` at start of day
- [ ] **Free**: Can identify 5 parts successfully
- [ ] **Free**: 6th identify returns 429 with quota exceeded message
- [ ] **Free**: Quota resets the next day
- [ ] **Plus**: Quota endpoint shows unlimited
- [ ] **Plus**: Can identify without limit

## Search Party

- [ ] **Free**: Quota shows 2 sessions remaining
- [ ] **Free**: Can host 2 sessions
- [ ] **Free**: 3rd host attempt returns 429 with quota exceeded
- [ ] **Free**: Quota shows reset date
- [ ] **Free**: Can still join sessions hosted by others
- [ ] **Plus**: Quota shows unlimited
- [ ] **Plus**: Can host without limit

## Rarity

- [ ] **Free**: No rarity badges on inventory items
- [ ] **Free**: No rarity filter/sort options in inventory controls
- [ ] **Plus**: Rarity badges visible (Exclusive, Very Rare, Rare)
- [ ] **Plus**: Can filter and sort by rarity

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

- [ ] **Unauth**: Shows comparison table, CTA says "Start 14-day free trial"
- [ ] **Free**: Same as unauth but with sign-in context
- [ ] **Plus**: CTA changes to reflect current subscription state
- [ ] **Returning** (previously subscribed): CTA says "Get Plus" (not "Start trial")

## Checkout Flow

- [ ] **Free → Plus**: Click trial CTA → Stripe Checkout → complete with test card
- [ ] Redirect to `/billing/success` with correct messaging
- [ ] Subscription appears in account billing tab (status: `trialing`)
- [ ] All Plus features unlock immediately
- [ ] Promo code: redeem `BRICKPARTYBETA` from billing tab → subscription created

## Account / Billing Tab

- [ ] **Free**: Shows "Free Plan" badge, promo code input, upgrade CTA
- [ ] **Trialing**: Shows "Plus (Trial)" badge, trial end date, "Manage Subscription" button
- [ ] **Active**: Shows "Plus" badge, renewal date, "Manage Subscription" button
- [ ] **Past Due**: Warning alert with "Update Payment" link to Stripe portal
- [ ] **Canceled**: Shows ended date, resubscribe CTA

## Dunning Banner

- [ ] **Past Due**: DunningBanner appears at top of page (use test card `4000 0000 0000 0341`)
- [ ] Clicking "Update Payment" opens Stripe billing portal
- [ ] After resolving payment, banner disappears on next page load

## Cancellation & Resubscribe

- [ ] Cancel via Stripe Portal from account page
- [ ] Billing tab shows "ends on [date]" with `cancel_at_period_end`
- [ ] After period ends, user downgrades to free (all limits re-enforced)
- [ ] Resubscribe: no trial offered, CTA says "Get Plus"

## Guest Checkout (Unauthenticated → Plus)

- [ ] Start checkout without signing in
- [ ] Complete with new email → user auto-created, subscription active
- [ ] Complete with existing email → linked to existing account

## Billing Portal

- [ ] "Manage Subscription" opens Stripe portal
- [ ] Can update payment method
- [ ] Can cancel subscription
- [ ] Can view invoice history
- [ ] Portal returns to `/account` after completion
