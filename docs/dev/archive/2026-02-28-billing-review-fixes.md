# Billing Review Fixes — All 16 Issues

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all issues from the comprehensive billing/payment code review.

**Architecture:** Targeted fixes across webhook, billing service, UI, and shared utilities.

**Tech Stack:** Next.js, Stripe API v20.1.0, Supabase GoTrue, existing rate limit infra

---

## Task 1: Fix webhook idempotency race + allow reprocessing failed events (#1, #2, #14)

Atomic INSERT with ON CONFLICT instead of SELECT-then-INSERT. Also allow reprocessing events with status='error'.

**Files:** `app/api/stripe/webhook/route.ts`

## Task 2: Handle `customer.subscription.created` gracefully for guest subscriptions (#9)

When the subscription event arrives before checkout.session.completed has linked the customer, the resolution will throw. Log a warning instead of error for guest subscriptions.

**Files:** `app/api/stripe/webhook/route.ts`

## Task 3: Deduplicate `getUserIdForCustomer` (#13)

Remove the duplicate from webhook, import from billing service.

**Files:** `app/api/stripe/webhook/route.ts`, `app/lib/services/billing.ts`

## Task 4: Extract shared `getEnvOrThrow` utility (#8)

Create `app/lib/env.ts` and replace all 6 app-level duplicates.

**Files:** New `app/lib/env.ts`, 6 existing files

## Task 5: Fix `current_period_end` unsafe cast (#7)

Stripe v20.1.0 doesn't expose `current_period_end` on the type. Use `trial_end` and `billing_cycle_anchor` or access via expanded invoice, or keep the cast with a clear comment.

**Files:** `app/lib/services/billing.ts`

## Task 6: Mark Pro tier price envs as optional (#16)

**Files:** `app/lib/services/billing.ts`

## Task 7: Mask PII in billing logs (#6)

**Files:** `app/lib/services/billing.ts`

## Task 8: UI/UX fixes (#10, #11, #12, #15)

- Add CSRF comment to guest checkout
- Better error handling in PricingSection for 429
- Fix authenticated success page trial copy
- Add comment to LandingPage

**Files:** `app/api/billing/guest-checkout/route.ts`, `app/components/landing/PricingSection.tsx`, `app/billing/success/page.tsx`, `app/components/landing/LandingPage.tsx`

## Task 9: Update billing spec trial days (#4)

**Files:** `docs/billing/stripe-subscriptions.md`

## Task 10: Verify everything
