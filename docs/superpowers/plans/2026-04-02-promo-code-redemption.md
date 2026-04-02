# Promo Code Redemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow beta testers and influencers to redeem a promo code (e.g. "BRICKPARTYBETA") that grants 3 months of Plus with no payment method required, with self-service UI on the pricing page and billing tab.

**Architecture:** A new `POST /api/billing/redeem-promo` route validates a promo code against Stripe, creates a subscription server-side with a 100%-off coupon (no Checkout session, no card), and the existing webhook flow syncs it to `billing_subscriptions`. The UI adds a "Have a promo code?" toggle on the pricing page and billing tab that calls this endpoint. No new database tables needed — Stripe is the source of truth for coupon validity.

**Tech Stack:** Next.js route handler, Stripe subscriptions API (coupon parameter), React client components, Zod validation, existing CSRF/auth middleware.

---

## File Structure

| Action | File                                        | Responsibility                                                           |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------ |
| Create | `app/lib/services/promo.ts`                 | Validate promo code against Stripe, create coupon-backed subscription    |
| Create | `app/api/billing/redeem-promo/route.ts`     | HTTP route: auth, validation, call promo service, return result          |
| Create | `app/components/PromoCodeInput.tsx`         | Reusable promo code input with toggle, loading, error states             |
| Create | `app/hooks/useRedeemPromo.ts`               | Client hook: POST to redeem-promo endpoint, manage loading/error/success |
| Create | `app/lib/services/__tests__/promo.test.ts`  | Unit tests for promo service                                             |
| Modify | `app/components/landing/PricingSection.tsx` | Add PromoCodeInput below the Plus CTA for free-tier authenticated users  |
| Modify | `app/account/components/BillingTab.tsx`     | Add PromoCodeInput in the free-tier state section                        |

---

### Task 1: Promo Service — Validation and Subscription Creation

**Files:**

- Create: `app/lib/services/promo.ts`
- Create: `app/lib/services/__tests__/promo.test.ts`

This service does two things: (1) validates a promo code string against Stripe's promotion codes API to find the associated coupon, and (2) creates a subscription for the user with that coupon applied.

- [ ] **Step 1: Write the failing test for `validatePromoCode`**

Create `app/lib/services/__tests__/promo.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: vi.fn(),
}));
vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/metrics', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getStripeClient } from '@/app/lib/stripe/client';
import { validatePromoCode } from '../promo';

const mockStripe = {
  promotionCodes: {
    list: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStripeClient).mockReturnValue(mockStripe as never);
});

describe('validatePromoCode', () => {
  it('returns coupon when promo code is valid and active', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_123',
          active: true,
          coupon: {
            id: 'AVtCbgeC',
            valid: true,
            percent_off: 100,
            duration: 'repeating',
            duration_in_months: 3,
          },
        },
      ],
    });

    const result = await validatePromoCode('BRICKPARTYBETA');
    expect(result).toEqual({
      valid: true,
      couponId: 'AVtCbgeC',
      promoCodeId: 'promo_123',
    });
    expect(mockStripe.promotionCodes.list).toHaveBeenCalledWith({
      code: 'BRICKPARTYBETA',
      active: true,
      limit: 1,
    });
  });

  it('returns invalid when no matching promo code exists', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({ data: [] });

    const result = await validatePromoCode('INVALIDCODE');
    expect(result).toEqual({ valid: false });
  });

  it('returns invalid when coupon is not valid', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_456',
          active: true,
          coupon: { id: 'coupon_expired', valid: false },
        },
      ],
    });

    const result = await validatePromoCode('EXPIREDCODE');
    expect(result).toEqual({ valid: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/promo.test.ts`
Expected: FAIL — `validatePromoCode` does not exist.

- [ ] **Step 3: Implement `validatePromoCode`**

Create `app/lib/services/promo.ts`:

```typescript
import 'server-only';

import { getStripeClient } from '@/app/lib/stripe/client';
import { logger } from '@/lib/metrics';

type PromoValidationResult =
  | { valid: true; couponId: string; promoCodeId: string }
  | { valid: false };

export async function validatePromoCode(
  code: string
): Promise<PromoValidationResult> {
  const stripe = getStripeClient();

  try {
    const promos = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });

    const promo = promos.data[0];
    if (!promo || !promo.coupon.valid) {
      return { valid: false };
    }

    return {
      valid: true,
      couponId: promo.coupon.id,
      promoCodeId: promo.id,
    };
  } catch (err) {
    logger.error('promo.validate_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { valid: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/services/__tests__/promo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `redeemPromoCode`**

Append to `app/lib/services/__tests__/promo.test.ts`:

```typescript
import { redeemPromoCode } from '../promo';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';

// Add to the existing mockStripe object:
// mockStripe.subscriptions = { create: vi.fn() };

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  limit: vi.fn().mockReturnThis(),
};

// Add before the describe blocks:
// vi.mocked(getSupabaseServiceRoleClient).mockReturnValue(mockSupabase as never);

describe('redeemPromoCode', () => {
  beforeEach(() => {
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.in.mockReturnThis();
    mockSupabase.limit.mockReturnThis();
  });

  it('creates a subscription with the coupon when user has no active sub', async () => {
    // No existing active subscription
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

    mockStripe.subscriptions.create.mockResolvedValue({
      id: 'sub_promo_123',
      status: 'active',
    });

    const result = await redeemPromoCode({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      couponId: 'AVtCbgeC',
    });

    expect(result).toEqual({ success: true });
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
      customer: 'cus_123',
      items: [{ price: process.env.STRIPE_PRICE_PLUS_MONTHLY }],
      coupon: 'AVtCbgeC',
      metadata: { user_id: 'user-1', promo_redemption: 'true' },
    });
  });

  it('rejects when user already has an active subscription', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({
      data: { id: 'existing-sub' },
      error: null,
    });

    const result = await redeemPromoCode({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      couponId: 'AVtCbgeC',
    });

    expect(result).toEqual({
      success: false,
      error: 'You already have an active subscription.',
    });
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  });
});
```

**Important:** This test block needs the mocks wired up at the top level. The full test file should have `mockStripe.subscriptions = { create: vi.fn() }` added to the mock object, and `vi.mocked(getSupabaseServiceRoleClient).mockReturnValue(mockSupabase as never)` in the top-level `beforeEach`.

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/promo.test.ts`
Expected: FAIL — `redeemPromoCode` does not exist.

- [ ] **Step 7: Implement `redeemPromoCode`**

Add to `app/lib/services/promo.ts`:

```typescript
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { invalidateEntitlements } from './entitlements';

type RedeemResult = { success: true } | { success: false; error: string };

export async function redeemPromoCode(params: {
  userId: string;
  stripeCustomerId: string;
  couponId: string;
}): Promise<RedeemResult> {
  const { userId, stripeCustomerId, couponId } = params;
  const stripe = getStripeClient();
  const supabase = getSupabaseServiceRoleClient();

  // Check for existing active subscription
  const { data: existingSub } = await supabase
    .from('billing_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .limit(1)
    .maybeSingle();

  if (existingSub) {
    return {
      success: false,
      error: 'You already have an active subscription.',
    };
  }

  try {
    await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: process.env.STRIPE_PRICE_PLUS_MONTHLY }],
      coupon: couponId,
      metadata: { user_id: userId, promo_redemption: 'true' },
    });

    // Invalidate entitlements cache — the webhook will upsert the subscription
    // row, but we can eagerly bust the cache so the next SSR load reflects Plus.
    invalidateEntitlements(userId);

    logger.info('promo.redeemed', { userId, couponId });

    return { success: true };
  } catch (err) {
    logger.error('promo.redeem_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: 'Failed to apply promo code. Please try again.',
    };
  }
}
```

- [ ] **Step 8: Run all promo tests to verify they pass**

Run: `npm test -- --run app/lib/services/__tests__/promo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add app/lib/services/promo.ts app/lib/services/__tests__/promo.test.ts
git commit -m "feat: add promo code validation and redemption service"
```

---

### Task 2: Redeem Promo API Route

**Files:**

- Create: `app/api/billing/redeem-promo/route.ts`

This route follows the exact same pattern as `create-checkout-session`: CSRF-protected, auth-required, Zod-validated body, delegates to the promo service.

- [ ] **Step 1: Create the route handler**

Create `app/api/billing/redeem-promo/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { ensureStripeCustomer } from '@/app/lib/services/billing';
import { validatePromoCode, redeemPromoCode } from '@/app/lib/services/promo';
import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

const schema = z.object({
  code: z.string().min(1).max(100),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation_failed', {
      message: 'Invalid JSON body',
      status: 400,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized', { status: 401 });
  }

  const code = parsed.data.code.trim().toUpperCase();

  // Step 1: Validate the promo code against Stripe
  const validation = await validatePromoCode(code);
  if (!validation.valid) {
    return errorResponse('validation_failed', {
      message: 'Invalid or expired promo code.',
      status: 400,
    });
  }

  try {
    // Step 2: Ensure user has a Stripe customer record
    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(user, { stripe });

    // Step 3: Create the coupon-backed subscription
    const result = await redeemPromoCode({
      userId: user.id,
      stripeCustomerId: customerId,
      couponId: validation.couponId,
    });

    if (!result.success) {
      return errorResponse('validation_failed', {
        message: result.error,
        status: 400,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('billing.redeem_promo_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
});
```

- [ ] **Step 2: Verify the route type-checks**

Run: `npx tsc --noEmit`
Expected: No errors related to `redeem-promo/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/redeem-promo/route.ts
git commit -m "feat: add POST /api/billing/redeem-promo route"
```

---

### Task 3: Client Hook — `useRedeemPromo`

**Files:**

- Create: `app/hooks/useRedeemPromo.ts`

Follows the same pattern as `usePortalSession` — a hook that manages loading/error/success state for a POST call.

- [ ] **Step 1: Create the hook**

Create `app/hooks/useRedeemPromo.ts`:

```typescript
'use client';

import { useCallback, useState } from 'react';

type RedeemState = {
  redeem: (code: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  success: boolean;
};

export function useRedeemPromo(): RedeemState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const redeem = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/billing/redeem-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message || 'Invalid promo code.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { redeem, loading, error, success };
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/hooks/useRedeemPromo.ts
git commit -m "feat: add useRedeemPromo client hook"
```

---

### Task 4: PromoCodeInput Component

**Files:**

- Create: `app/components/PromoCodeInput.tsx`

A self-contained component: collapsed "Have a promo code?" link → expands to input + Apply button → shows success or error state. After success, prompts a page reload so SSR entitlements refresh.

- [ ] **Step 1: Create the component**

Create `app/components/PromoCodeInput.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/app/components/ui/Button';
import { useRedeemPromo } from '@/app/hooks/useRedeemPromo';

export function PromoCodeInput() {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState('');
  const { redeem, loading, error, success } = useRedeemPromo();
  const router = useRouter();

  if (success) {
    // Refresh SSR data so entitlements update immediately
    router.refresh();
    return (
      <p className="text-sm font-medium text-success">
        Promo code applied! Welcome to Plus.
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-sm text-foreground-muted underline underline-offset-2 hover:text-foreground"
      >
        Have a promo code?
      </button>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      redeem(code.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Enter promo code"
          disabled={loading}
          className="flex-1 rounded-lg border border-subtle bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-theme-primary focus:outline-none"
        />
        <Button
          type="submit"
          disabled={loading || !code.trim()}
          variant="primary"
          size="sm"
        >
          {loading ? 'Applying...' : 'Apply'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/PromoCodeInput.tsx
git commit -m "feat: add PromoCodeInput component with toggle and redeem flow"
```

---

### Task 5: Add PromoCodeInput to Pricing Page

**Files:**

- Modify: `app/components/landing/PricingSection.tsx`

Add the promo code input below the Plus CTA, visible only to authenticated free-tier users (the audience who would have a promo code but hasn't subscribed yet).

- [ ] **Step 1: Add the PromoCodeInput import and render it**

In `app/components/landing/PricingSection.tsx`, add the import at the top:

```typescript
import { PromoCodeInput } from '@/app/components/PromoCodeInput';
```

Then, inside the Plus tier card's `<div className="mt-auto">` section (around line 313), add the PromoCodeInput below `renderPlusCta()` and above the error display. It should only show for authenticated free-tier users who don't have an active/canceled/past_due subscription:

Replace:

```tsx
<div className="mt-auto">
  {renderPlusCta()}
  {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
</div>
```

With:

```tsx
<div className="mt-auto flex flex-col gap-3">
  {renderPlusCta()}
  {isAuthenticated &&
    tier === 'free' &&
    !isActiveSubscription &&
    !isCanceled &&
    !isPastDue && <PromoCodeInput />}
  {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
</div>
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manually verify in the browser**

1. Log in as a free-tier user.
2. Navigate to `/pricing`.
3. Verify "Have a promo code?" link appears below the Plus CTA button.
4. Click it — input and Apply button should appear.
5. Verify it does NOT appear for unauthenticated visitors.
6. Verify it does NOT appear for users with active subscriptions.

- [ ] **Step 4: Commit**

```bash
git add app/components/landing/PricingSection.tsx
git commit -m "feat: add promo code input to pricing page for free-tier users"
```

---

### Task 6: Add PromoCodeInput to Billing Tab

**Files:**

- Modify: `app/account/components/BillingTab.tsx`

Add the promo code input in the free-tier state section of the billing tab, below the "Upgrade to Plus" button.

- [ ] **Step 1: Add the PromoCodeInput import and render it**

In `app/account/components/BillingTab.tsx`, add the import at the top:

```typescript
import { PromoCodeInput } from '@/app/components/PromoCodeInput';
```

Then, inside the `state === 'free'` block (around line 96-108), add the PromoCodeInput below the "Upgrade to Plus" button:

Replace:

```tsx
{
  state === 'free' && (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <PlanBadge label="Free Plan" variant="free" />
      </div>
      <p className="text-sm text-foreground-muted">
        You are on the Free plan. Upgrade to Plus for unlimited tabs, custom
        lists, part identification, and more.
      </p>
      <Button href="/pricing" variant="primary" size="sm">
        Upgrade to Plus
      </Button>
    </div>
  );
}
```

With:

```tsx
{
  state === 'free' && (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <PlanBadge label="Free Plan" variant="free" />
      </div>
      <p className="text-sm text-foreground-muted">
        You are on the Free plan. Upgrade to Plus for unlimited tabs, custom
        lists, part identification, and more.
      </p>
      <Button href="/pricing" variant="primary" size="sm">
        Upgrade to Plus
      </Button>
      <PromoCodeInput />
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manually verify in the browser**

1. Log in as a free-tier user.
2. Navigate to `/account` → Billing tab.
3. Verify "Have a promo code?" link appears below the "Upgrade to Plus" button.
4. Click it — input and Apply button should appear.
5. Verify it does NOT appear for users with active/trialing/past_due/canceled subscriptions.

- [ ] **Step 4: Commit**

```bash
git add app/account/components/BillingTab.tsx
git commit -m "feat: add promo code input to billing tab for free-tier users"
```

---

### Task 7: Create Stripe Promotion Code for the Coupon

The coupon `AVtCbgeC` already exists in Stripe, but the `promotionCodes.list` API searches by **promotion code** (the user-facing string), not coupon ID. A promotion code must be created that maps the string "BRICKPARTYBETA" to the coupon.

- [ ] **Step 1: Create the promotion code in Stripe**

Use the Stripe MCP tool `mcp__plugin_stripe_stripe__stripe_api_execute` or the Stripe dashboard to create a promotion code:

```
stripe.promotionCodes.create({
  coupon: 'AVtCbgeC',
  code: 'BRICKPARTYBETA',
  active: true,
})
```

Alternatively, use the Stripe Dashboard: Coupons → AVtCbgeC → Create promotion code → Code: "BRICKPARTYBETA".

- [ ] **Step 2: Verify the promotion code resolves correctly**

Test via Stripe CLI or dashboard that listing promotion codes with `code: 'BRICKPARTYBETA'` returns the promotion code with coupon `AVtCbgeC`.

- [ ] **Step 3: No commit needed — this is a Stripe-side configuration step**

---

### Task 8: End-to-End Manual Test

- [ ] **Step 1: Full flow test**

1. Start dev server (`npm run dev` — assume already running).
2. Log in as a free-tier test user.
3. Go to `/pricing`.
4. Click "Have a promo code?" → enter "BRICKPARTYBETA" → click Apply.
5. Verify success message: "Promo code applied! Welcome to Plus."
6. Verify the page refreshes and the Plus CTA now shows "Current plan".
7. Check `/account` → Billing tab shows Plus status.
8. Verify Stripe dashboard shows the subscription with the coupon applied.

- [ ] **Step 2: Error case tests**

1. Try an invalid code → verify "Invalid or expired promo code." error.
2. Try redeeming again with an active subscription → verify "You already have an active subscription." error.
3. Try redeeming while logged out → verify 401 response (the UI shouldn't show the input, but the API should be safe).

- [ ] **Step 3: Verify webhook sync**

Check `billing_subscriptions` in Supabase to confirm the webhook created the row with:

- `tier = 'plus'`
- `status = 'active'`
- `current_period_end` set to ~3 months from now (when the coupon runs out, the billing cycle still exists)

- [ ] **Step 4: Final commit — dunning text changes from earlier**

```bash
git add app/components/dunning-banner.tsx app/account/components/BillingTab.tsx
git commit -m "fix: soften dunning text to work for promo and regular subscribers"
```

Note: The dunning text changes were already made earlier in the conversation. This step commits them alongside the promo feature if not already committed.
