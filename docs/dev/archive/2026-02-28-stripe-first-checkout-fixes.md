# Stripe-First Guest Checkout — Audit Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all issues identified in the post-implementation audit of the Stripe-first guest checkout feature.

**Architecture:** Four targeted fixes to existing files — no new modules. Replace the O(N) user lookup with a direct GoTrue REST call, harden the guest checkout endpoint with JSON parse safety and IP-based rate limiting, handle the invite race condition in the webhook, and improve the success page to show the right copy for existing users who checked out as guests.

**Tech Stack:** Next.js Route Handlers, Supabase GoTrue REST API, existing `consumeRateLimit` utility, Stripe webhook

---

## Task 1: Wrap `req.json()` in try/catch for guest checkout

Malformed JSON body (e.g. truncated request, wrong Content-Type) causes `req.json()` to throw, resulting in an unhandled 500 instead of a 400.

**Files:**

- Modify: `app/api/billing/guest-checkout/route.ts`
- Modify: `app/api/billing/__tests__/guest-checkout.test.ts`

**Step 1: Add test for malformed JSON body**

In `app/api/billing/__tests__/guest-checkout.test.ts`, add inside the `validation` describe block:

```typescript
it('returns 400 for malformed JSON body', async () => {
  const req = new NextRequest('http://localhost/api/billing/guest-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{{not json',
  });

  const res = await POST(req);

  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toBe('validation_failed');
});

it('returns 400 for empty body', async () => {
  const req = new NextRequest('http://localhost/api/billing/guest-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  });

  const res = await POST(req);

  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toBe('validation_failed');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/api/billing/__tests__/guest-checkout.test.ts`
Expected: 2 new tests FAIL (unhandled exception from `req.json()`)

**Step 3: Wrap `req.json()` in try/catch**

In `app/api/billing/guest-checkout/route.ts`, replace the parsing block:

```typescript
// Before:
const parsed = schema.safeParse(await req.json());

// After:
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/api/billing/__tests__/guest-checkout.test.ts`
Expected: All tests PASS

**Step 5: Apply same fix to authenticated endpoint**

In `app/api/billing/create-checkout-session/route.ts`, apply the same `req.json()` try/catch pattern (line 27):

```typescript
// Before:
const parsed = schema.safeParse(await req.json());

// After:
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
```

**Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 7: Commit**

```bash
git add app/api/billing/guest-checkout/route.ts app/api/billing/create-checkout-session/route.ts app/api/billing/__tests__/guest-checkout.test.ts
git commit -m "Return 400 for malformed JSON in checkout endpoints"
```

---

## Task 2: Replace O(N) `findUserByEmail` with direct GoTrue REST call

The current `findUserByEmail` paginates through all users via `listUsers` with client-side email filtering (O(N) scan). The GoTrue admin API supports a `filter` query parameter that does server-side SQL filtering, turning this into a single HTTP request.

**Files:**

- Modify: `app/lib/services/billing.ts`
- Modify: `app/lib/services/__tests__/guest-user-resolution.test.ts`

**Step 1: Update tests to mock fetch instead of `listUsers`**

Replace the `findUserByEmail` usage in tests. The function will now use `fetch` internally instead of `supabase.auth.admin.listUsers`. Update `guest-user-resolution.test.ts`:

- Remove mock for `listUsers` from `makeMockSupabase`
- Add `vi.stubGlobal('fetch', mockFetch)` for the GoTrue REST call
- Update test cases that verify pagination behavior (the pagination test becomes irrelevant)
- Keep the invite tests as-is since `inviteUserByEmail` is unchanged

The mock fetch should simulate the GoTrue response shape:

```typescript
// Success response:
{
  users: [{ id: 'uuid', email: 'user@example.com' }];
}

// No match response:
{
  users: [];
}
```

Required env vars for the REST call:

```typescript
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/lib/services/__tests__/guest-user-resolution.test.ts`
Expected: Tests FAIL (function still uses `listUsers`)

**Step 3: Rewrite `findUserByEmail` to use GoTrue REST API**

In `app/lib/services/billing.ts`, replace the `findUserByEmail` function (lines 265–307):

```typescript
/**
 * Look up a Supabase auth user by email using the GoTrue admin REST API.
 *
 * Uses the `filter` query parameter for server-side SQL filtering,
 * then verifies exact email match client-side (filter is a LIKE/substring match).
 */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('billing.find_user_missing_env', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey,
    });
    return null;
  }

  try {
    const url = `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email.toLowerCase())}`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!res.ok) {
      logger.error('billing.find_user_rest_failed', {
        email,
        status: res.status,
      });
      return null;
    }

    const data: { users?: Array<{ id: string; email?: string }> } =
      await res.json();
    const match = data.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );
    return match ? { id: match.id } : null;
  } catch (err) {
    logger.error('billing.find_user_request_failed', {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
```

Also update `resolveGuestCheckoutUser` to call `findUserByEmail(email)` without the `supabase` parameter (it no longer needs it):

```typescript
// Before:
const existing = await findUserByEmail(email, supabase);

// After:
const existing = await findUserByEmail(email);
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/lib/services/__tests__/guest-user-resolution.test.ts`
Expected: All tests PASS

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add app/lib/services/billing.ts app/lib/services/__tests__/guest-user-resolution.test.ts
git commit -m "Replace O(N) listUsers scan with GoTrue REST filter for email lookup"
```

---

## Task 3: Handle invite race condition in `resolveGuestCheckoutUser`

Concurrent webhook deliveries for the same email can cause `inviteUserByEmail` to fail with "A user with this email address has already been registered" if a parallel call already created the user. Catch this error and retry the lookup.

**Files:**

- Modify: `app/lib/services/billing.ts`
- Modify: `app/lib/services/__tests__/guest-user-resolution.test.ts`

**Step 1: Add test for race condition**

In `guest-user-resolution.test.ts`, add:

```typescript
it('retries lookup when invite fails with "already been registered"', async () => {
  // First findUserByEmail: no match
  // inviteUserByEmail: fails with "already been registered"
  // Second findUserByEmail: finds the user (created by concurrent webhook)

  const { supabase } = makeMockSupabase({
    inviteUserByEmail: vi.fn().mockResolvedValue({
      data: { user: null },
      error: {
        message: 'A user with this email address has already been registered',
      },
    }),
  });

  // Mock fetch: first call returns no users, second call returns the user
  const mockFetchFn = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        users: [{ id: EXISTING_USER_ID, email: TEST_EMAIL }],
      }),
    });
  vi.stubGlobal('fetch', mockFetchFn);

  const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

  expect(userId).toBe(EXISTING_USER_ID);
  expect(mockFetchFn).toHaveBeenCalledTimes(2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/guest-user-resolution.test.ts`
Expected: FAIL — currently throws "Failed to invite guest user"

**Step 3: Add retry logic**

In `app/lib/services/billing.ts`, in `resolveGuestCheckoutUser`, after the invite call, add a check for the "already registered" error:

```typescript
// After the inviteUserByEmail call:
if (inviteError) {
  // Race condition: another webhook already created this user
  const isAlreadyRegistered =
    inviteError.message?.includes('already been registered') ?? false;

  if (isAlreadyRegistered) {
    logger.info('billing.guest_invite_race_condition', { email });
    const retryLookup = await findUserByEmail(email);
    if (retryLookup) {
      return retryLookup.id;
    }
  }

  logger.error('billing.guest_invite_failed', {
    email,
    error: inviteError.message,
  });
  throw new Error(`Failed to invite guest user: ${inviteError.message}`);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/lib/services/__tests__/guest-user-resolution.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add app/lib/services/billing.ts app/lib/services/__tests__/guest-user-resolution.test.ts
git commit -m "Handle invite race condition with retry lookup"
```

---

## Task 4: Add IP-based rate limiting to guest checkout

The guest checkout endpoint is unauthenticated and has no rate limiting. Use the existing `consumeRateLimit` + `getClientIp` pattern (same as `/api/search`).

**Files:**

- Modify: `app/api/billing/guest-checkout/route.ts`
- Modify: `app/lib/constants.ts`
- Modify: `app/api/billing/__tests__/guest-checkout.test.ts`

**Step 1: Add rate limit constant**

In `app/lib/constants.ts`, add to the `RATE_LIMIT` object:

```typescript
/** Maximum guest checkout requests per window per IP */
GUEST_CHECKOUT_MAX: 5,
```

**Step 2: Add test for rate limiting**

In `guest-checkout.test.ts`, add mock for rate limiter and a test:

```typescript
// Add mock at top level:
const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

// In beforeEach:
mockConsumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
mockGetClientIp.mockResolvedValue('127.0.0.1');

// New test:
describe('rate limiting', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockConsumeRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });

    const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
    expect(res.headers.get('Retry-After')).toBe('42');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- --run app/api/billing/__tests__/guest-checkout.test.ts`
Expected: FAIL — no rate limiting in endpoint yet

**Step 4: Add rate limiting to the endpoint**

In `app/api/billing/guest-checkout/route.ts`, add imports and rate limit check at the top of `POST`:

```typescript
import { RATE_LIMIT } from '@/app/lib/constants';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  // IP-based rate limit
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`guest-checkout:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.GUEST_CHECKOUT_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  // ... rest of handler unchanged
```

**Step 5: Run tests to verify they pass**

Run: `npm test -- --run app/api/billing/__tests__/guest-checkout.test.ts`
Expected: All tests PASS

**Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 7: Commit**

```bash
git add app/api/billing/guest-checkout/route.ts app/lib/constants.ts app/api/billing/__tests__/guest-checkout.test.ts
git commit -m "Add IP-based rate limiting to guest checkout endpoint"
```

---

## Task 5: Fix success page for existing users who checked out as guests

The unauth success page always says "We sent an invite to your email" — but if an existing user (e.g. Google OAuth) goes through guest checkout, no invite email is sent. The copy should be generic enough to work for both cases.

**Files:**

- Modify: `app/billing/success/page.tsx`

**Step 1: Update unauth copy to be accurate for both cases**

Replace the unauth block in `app/billing/success/page.tsx`:

```tsx
if (!isAuthenticated) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-green-600">
          Payment confirmed
        </p>
        <h1 className="text-3xl font-bold">You&apos;re in!</h1>
        <p className="text-foreground-muted">
          Check your email for a link to sign in and start using Plus.
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
```

The key change: "We sent an invite to your email. Click the link to set up your password" → "Check your email for a link to sign in and start using Plus." This works for both:

- **New users**: They get an invite email and will use the link to set up their password
- **Existing users**: They can sign in with their existing credentials (the "Sign in" button covers this)

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add app/billing/success/page.tsx
git commit -m "Fix success page copy to work for both new and existing guest checkouts"
```

---

## Task 6: Verify everything

**Step 1: Run all tests**

Run: `npm test -- --run`
Expected: All pass

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Lint**

Run: `npm run lint`
Expected: No new warnings

**Step 4: Manual checklist**

1. Malformed JSON POST to `/api/billing/guest-checkout` → 400, not 500
2. Rate limit: 6th request in 60s to guest checkout → 429 with Retry-After header
3. `/billing/success` (unauthed) → "Check your email for a link to sign in"
4. `/billing/success` (authed) → "Welcome to Plus!" (unchanged)
5. Guest checkout webhook for existing Google OAuth user → user resolved without invite
6. Two concurrent webhooks for same new email → second handles "already registered" gracefully

---

## Summary of Changes

| Issue                                | Severity   | Fix                                              |
| ------------------------------------ | ---------- | ------------------------------------------------ |
| Malformed JSON → 500                 | Must fix   | try/catch around `req.json()` in both endpoints  |
| `findUserByEmail` O(N) scan          | Should fix | Direct GoTrue REST call with `filter` param      |
| Invite race condition                | Should fix | Catch "already been registered", retry lookup    |
| No rate limiting on guest checkout   | Should fix | IP-based rate limit (5/min) using existing infra |
| Success page misleads existing users | Must fix   | Generic copy that works for new + existing users |
