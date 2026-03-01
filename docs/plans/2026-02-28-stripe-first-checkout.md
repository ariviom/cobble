# Stripe-First Guest Checkout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let unauthenticated users pay via Stripe Checkout without signing up first. The webhook creates their Supabase account after payment.

**Architecture:** New unauthenticated endpoint creates a Stripe Checkout session without requiring auth. On `checkout.session.completed`, the existing webhook resolves the user by email — finding an existing Supabase user or inviting a new one via `auth.admin` — then links the subscription as normal. The PricingSection CTA switches from linking to `/signup` to calling the guest checkout endpoint directly.

**Tech Stack:** Next.js Route Handlers, Stripe Checkout API, Supabase Admin Auth API, existing billing service layer

---

## Task 1: Guest Checkout Endpoint

**Files:**

- Create: `app/api/billing/guest-checkout/route.ts`

**Step 1: Write the failing test**

Create `app/api/billing/__tests__/guest-checkout.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Save original env
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_plus_monthly';
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly';
  process.env.STRIPE_CHECKOUT_SUCCESS_URL =
    'http://localhost:3000/billing/success';
  process.env.STRIPE_CHECKOUT_CANCEL_URL =
    'http://localhost:3000/billing/cancel';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// Mock Stripe
const mockCreate = vi.fn();
vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: mockCreate } },
  }),
}));

// Mock billing service
vi.mock('@/app/lib/services/billing', async () => {
  const actual = await vi.importActual('@/app/lib/services/billing');
  return { ...actual };
});

describe('POST /api/billing/guest-checkout', () => {
  it('rejects missing priceId', async () => {
    const { POST } = await import('../guest-checkout/route');
    const req = new Request('http://localhost/api/billing/guest-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rejects unknown priceId', async () => {
    const { POST } = await import('../guest-checkout/route');
    const req = new Request('http://localhost/api/billing/guest-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_fake' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('creates checkout session and returns url', async () => {
    mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
    const { POST } = await import('../guest-checkout/route');
    const req = new Request('http://localhost/api/billing/guest-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_plus_monthly' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toBe('https://checkout.stripe.com/test');
  });

  it('creates session with customer_creation and no customer param', async () => {
    mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test' });
    const { POST } = await import('../guest-checkout/route');
    const req = new Request('http://localhost/api/billing/guest-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: 'price_plus_monthly' }),
    });
    await POST(req as any);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.customer_creation).toBe('always');
    expect(callArgs.customer).toBeUndefined();
    expect(callArgs.metadata?.guest).toBe('true');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/billing/__tests__/guest-checkout.test.ts`
Expected: FAIL — module `../guest-checkout/route` not found

**Step 3: Write the endpoint**

Create `app/api/billing/guest-checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { mapPriceToTier } from '@/app/lib/services/billing';
import { getStripeClient } from '@/app/lib/stripe/client';
import { logger } from '@/lib/metrics';

const schema = z.object({
  priceId: z.string().min(1),
});

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const priceId = parsed.data.priceId;

  try {
    mapPriceToTier(priceId);
  } catch {
    return errorResponse('invalid_format', {
      message: 'Unknown priceId',
      status: 400,
    });
  }

  const stripe = getStripeClient();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_creation: 'always',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: getEnvOrThrow('STRIPE_CHECKOUT_SUCCESS_URL'),
      cancel_url: getEnvOrThrow('STRIPE_CHECKOUT_CANCEL_URL'),
      allow_promotion_codes: false,
      automatic_tax: { enabled: true },
      subscription_data: {
        trial_period_days: 14,
        metadata: { guest: 'true' },
      },
      metadata: { guest: 'true' },
    });

    if (!session.url) {
      return errorResponse('unknown_error', {
        message: 'Failed to create checkout session',
        status: 500,
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error('billing.guest_checkout_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
}
```

Key differences from the authed endpoint:

- No `withCsrfProtection` wrapper (no auth session to protect)
- No `getSupabaseAuthServerClient()` / user check
- `customer_creation: 'always'` instead of passing an existing `customer`
- No prior-subscription trial check (can't check without user — acceptable for MVP)
- `metadata.guest: 'true'` to identify guest sessions in webhook
- Always offers 14-day trial

**Step 4: Run test to verify it passes**

Run: `npm test -- --run app/api/billing/__tests__/guest-checkout.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/api/billing/guest-checkout/route.ts app/api/billing/__tests__/guest-checkout.test.ts
git commit -m "Add unauthenticated guest checkout endpoint"
```

---

## Task 2: User Resolution Service Function

**Files:**

- Modify: `app/lib/services/billing.ts`
- Create: `app/lib/services/__tests__/guest-user-resolution.test.ts`

This function is called by the webhook when a checkout session has no `user_id` in metadata (guest checkout). It finds an existing Supabase user by email or creates a new one.

**Step 1: Write the failing test**

Create `app/lib/services/__tests__/guest-user-resolution.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the supabase service role client
const mockGetUserByEmail = vi.fn();
const mockInviteUserByEmail = vi.fn();
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert });

const mockSupabase = {
  auth: {
    admin: {
      getUserByEmail: mockGetUserByEmail,
      inviteUserByEmail: mockInviteUserByEmail,
    },
  },
  from: mockFrom,
};

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => mockSupabase,
}));

describe('resolveGuestCheckoutUser', () => {
  it('returns existing user id when user found by email', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: { user: { id: 'existing-user-id', email: 'a@b.com' } },
      error: null,
    });

    const { resolveGuestCheckoutUser } = await import('../billing');
    const userId = await resolveGuestCheckoutUser('a@b.com', {
      supabase: mockSupabase as any,
    });
    expect(userId).toBe('existing-user-id');
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it('creates and invites new user when email not found', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'User not found' },
    });
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-id' } },
      error: null,
    });

    const { resolveGuestCheckoutUser } = await import('../billing');
    const userId = await resolveGuestCheckoutUser('new@b.com', {
      supabase: mockSupabase as any,
    });
    expect(userId).toBe('new-user-id');
    expect(mockInviteUserByEmail).toHaveBeenCalledWith(
      'new@b.com',
      expect.any(Object)
    );
  });

  it('throws when invite fails', async () => {
    mockGetUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'User not found' },
    });
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invite failed' },
    });

    const { resolveGuestCheckoutUser } = await import('../billing');
    await expect(
      resolveGuestCheckoutUser('fail@b.com', { supabase: mockSupabase as any })
    ).rejects.toThrow('Failed to create account');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/guest-user-resolution.test.ts`
Expected: FAIL — `resolveGuestCheckoutUser` is not exported

**Step 3: Add the function to billing.ts**

Add to `app/lib/services/billing.ts`:

```typescript
/**
 * Resolve (or create) a Supabase user for a guest checkout by email.
 *
 * 1. Look up existing user by email (covers Google OAuth, prior email signup).
 * 2. If not found, invite via admin API — creates user + sends invite email.
 * 3. Returns the user_id for linking billing records.
 */
export async function resolveGuestCheckoutUser(
  email: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<string> {
  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();

  // Check for existing user (Google OAuth, prior email/password signup, etc.)
  const { data: existing } = await supabase.auth.admin.getUserByEmail(email);
  if (existing?.user?.id) {
    logger.info('billing.guest_checkout_existing_user', { email });
    return existing.user.id;
  }

  // No existing user — invite them (creates user + sends invite email)
  const { data: invited, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback?next=/sets`,
    });

  if (inviteError || !invited?.user?.id) {
    logger.error('billing.guest_user_creation_failed', {
      email,
      error: inviteError?.message ?? 'No user returned',
    });
    throw new Error('Failed to create account for guest checkout');
  }

  logger.info('billing.guest_checkout_new_user', {
    email,
    userId: invited.user.id,
  });
  return invited.user.id;
}
```

Note: `inviteUserByEmail` creates the user immediately in `auth.users` (so FK constraints work) and sends an invite email. The user clicks the link to set their password.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/services/__tests__/guest-user-resolution.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/lib/services/billing.ts app/lib/services/__tests__/guest-user-resolution.test.ts
git commit -m "Add resolveGuestCheckoutUser for Stripe-first checkout"
```

---

## Task 3: Enhance Webhook for Guest Checkouts

**Files:**

- Modify: `app/api/stripe/webhook/route.ts`

The existing `handleCheckoutCompleted` resolves `userId` from metadata or customer lookup. We add a third fallback: resolve by email via the new `resolveGuestCheckoutUser`.

**Step 1: Modify handleCheckoutCompleted**

In `app/api/stripe/webhook/route.ts`, update `handleCheckoutCompleted`:

```typescript
import { resolveGuestCheckoutUser } from '@/app/lib/services/billing';

async function handleCheckoutCompleted(
  supabase: Supabase,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const stripeCustomerId =
    (typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id) ?? null;
  const metadataUserId =
    (session.metadata?.user_id as string | undefined) ?? null;
  const isGuestCheckout = session.metadata?.guest === 'true';

  // Resolve user: metadata → customer lookup → email (guest checkout)
  let resolvedUserId: string | undefined = metadataUserId ?? undefined;

  if (!resolvedUserId && stripeCustomerId) {
    resolvedUserId =
      (await getUserIdForCustomer(supabase, stripeCustomerId)) ?? undefined;
  }

  if (!resolvedUserId && isGuestCheckout) {
    const email =
      session.customer_details?.email ?? session.customer_email ?? null;
    if (email) {
      resolvedUserId = await resolveGuestCheckoutUser(email, { supabase });
    }
  }

  // Upsert customer record (needs both userId and stripeCustomerId)
  if (stripeCustomerId && resolvedUserId) {
    await upsertCustomerRecord(supabase, {
      userId: resolvedUserId,
      stripeCustomerId,
      email: session.customer_details?.email ?? session.customer_email ?? null,
    });
  }

  const subscriptionId =
    (typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id) ?? null;

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  const result = await upsertSubscriptionFromStripe(subscription, {
    supabase,
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
  });
  invalidateEntitlements(result.userId);
}
```

The key change: a third resolution path via `resolveGuestCheckoutUser` when `session.metadata.guest === 'true'` and no userId found from the first two paths.

**Step 2: Run existing tests**

Run: `npm test -- --run`
Expected: All existing tests still pass (webhook tests are minimal — this is mainly a type-check and integration concern)

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "Handle guest checkout in webhook via email-based user resolution"
```

---

## Task 4: Update Success Page

**Files:**

- Modify: `app/billing/success/page.tsx`

The success page needs to detect whether the user is authenticated. Authed users see "Welcome to Plus!" with app links. Unauthed users (guest checkout) see instructions to check their email.

**Step 1: Convert to server component with auth check**

Rewrite `app/billing/success/page.tsx`:

```typescript
import { Button } from '@/app/components/ui/Button';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';

export default async function BillingSuccessPage() {
  let isAuthenticated = false;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = !!user;
  } catch {
    // Treat as unauthenticated
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-green-600">
            Payment confirmed
          </p>
          <h1 className="text-3xl font-bold">You're in!</h1>
          <p className="text-foreground-muted">
            We sent an invite to your email. Click the link to set up your
            password and start using Plus.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <Button href="/login" variant="primary">
            Sign in
          </Button>
          <Button href="/" variant="outline">
            Back to app
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-green-600">Success</p>
        <h1 className="text-3xl font-bold">Welcome to Plus!</h1>
        <p className="text-foreground-muted">
          Your 14-day trial has started. You now have full access to all Plus
          features.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button href="/">Start exploring</Button>
        <Button href="/account" variant="outline">
          View account
        </Button>
      </div>
    </main>
  );
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add app/billing/success/page.tsx
git commit -m "Branch success page for guest vs authenticated checkout"
```

---

## Task 5: Update PricingSection CTA

**Files:**

- Modify: `app/components/landing/PricingSection.tsx`

Currently, the unauth Plus CTA is a link to `/signup`. Change it to call `handleCheckout`, which routes to the guest checkout endpoint for unauth users.

**Step 1: Update handleCheckout to pick the right endpoint**

In `PricingSection.tsx`, change the `handleCheckout` function:

```typescript
const handleCheckout = async () => {
  setLoading(true);
  setError(null);
  try {
    const endpoint = isAuthenticated
      ? '/api/billing/create-checkout-session'
      : '/api/billing/guest-checkout';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: activePriceId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError('Something went wrong. Please try again.');
    }
  } catch {
    setError('Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

**Step 2: Update renderPlusCta for unauth users**

Replace the unauth branch in `renderPlusCta`:

```typescript
function renderPlusCta() {
  if (!isAuthenticated) {
    // Guest checkout — skip signup, go straight to Stripe
    if (activePriceId) {
      return (
        <Button
          onClick={handleCheckout}
          disabled={loading}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Redirecting...' : 'Get Brick Party Plus'}
        </Button>
      );
    }
    // No price ID available (e.g. env not set) — fall back to signup link
    return (
      <Button href="/signup" variant="primary" className="w-full">
        Get Brick Party Plus
      </Button>
    );
  }
  // ... rest unchanged
}
```

The fallback to `/signup` covers the case where price IDs aren't configured (shouldn't happen in prod, but defensive).

**Step 3: Run type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean

**Step 4: Commit**

```bash
git add app/components/landing/PricingSection.tsx
git commit -m "Wire unauth Plus CTA to guest checkout endpoint"
```

---

## Task 6: Verify End-to-End

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 2: Lint**

Run: `npm run lint`
Expected: No new warnings

**Step 3: Run all tests**

Run: `npm test -- --run`
Expected: All pass

**Step 4: Manual verification checklist**

1. `/` landing page → click "Get Brick Party Plus" → redirects to Stripe Checkout (no signup)
2. `/pricing` (authed) → "Start 14-day free trial" → uses authed endpoint (with CSRF)
3. `/pricing` (unauthed via incognito) → "Get Brick Party Plus" → uses guest endpoint
4. Toggle monthly/annually → correct price sent to Stripe
5. `STRIPE_PRICE_PLUS_YEARLY` unset → toggle hidden, monthly only, CTA still works
6. Cancel on Stripe → `/billing/cancel` page
7. Complete on Stripe → `/billing/success` → shows "check your email" for unauthed
8. Webhook creates user + subscription (check Supabase `auth.users` and `billing_subscriptions`)

---

## Edge Cases & Future Work

**Handled:**

- Existing user (Google OAuth) pays as guest → webhook finds user by email, links subscription
- New email → webhook invites user, links subscription
- No price IDs configured → falls back to `/signup` link

**Deferred (acceptable for MVP):**

- Trial abuse via multiple emails — low risk (needs new email + payment method each time)
- Rate limiting on guest endpoint — Stripe's own abuse prevention covers most cases
- Custom invite email branding — uses Supabase default invite template for now

**Future improvements:**

- Store `session_id` in success URL to show personalized messaging
- Custom transactional email for guest checkout welcome
- Trial abuse detection by Stripe customer email lookup
