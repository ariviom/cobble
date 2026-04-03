# Serverless Performance Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce SSR page navigation latency by eliminating redundant auth calls, unnecessary dynamic rendering, sequential data fetching, and per-request overhead.

**Architecture:** Six independent code-level fixes. Each targets a different source of latency and can be implemented/tested in isolation. No new dependencies. No architectural changes.

**Tech Stack:** Next.js (app router), Supabase SSR (`@supabase/ssr`), Sentry (`@sentry/nextjs`)

**Spec:** `docs/superpowers/specs/2026-04-03-serverless-performance-design.md`

---

## File Map

| File                                  | Action | Responsibility                                         |
| ------------------------------------- | ------ | ------------------------------------------------------ |
| `app/lib/supabaseAuthServerClient.ts` | Modify | Add `getSupabaseSession()` helper                      |
| `app/page.tsx`                        | Modify | Switch from `getUser()` to `getSupabaseSession()`      |
| `app/pricing/page.tsx`                | Modify | Switch from `getUser()` to `getSupabaseSession()`      |
| `app/collection/page.tsx`             | Modify | Switch from `getUser()` to `getSupabaseSession()`      |
| `app/collection/[handle]/page.tsx`    | Modify | Switch from `getUser()` to `getSupabaseSession()`      |
| `app/identify/page.tsx`               | Modify | Switch to `getSupabaseSession()` + parallelize fetches |
| `app/search/page.tsx`                 | Modify | Remove `force-dynamic`                                 |
| `app/user/[handle]/page.tsx`          | Modify | Remove `revalidate = 0`                                |
| `sentry.server.config.ts`             | Modify | Set `tracesSampleRate: 0`                              |
| `sentry.edge.config.ts`               | Modify | Set `tracesSampleRate: 0`                              |
| `utils/supabase/middleware.ts`        | Modify | Cache CSP string at module level                       |

---

### Task 1: Add `getSupabaseSession()` Helper

**Files:**

- Modify: `app/lib/supabaseAuthServerClient.ts`

- [ ] **Step 1: Add the `getSupabaseSession` function**

Add after the existing `getSupabaseAuthServerClient` function:

```typescript
/**
 * Lightweight session check for server components.
 *
 * Reads the JWT from cookies via `getSession()` — no network roundtrip.
 * Safe to use when middleware has already called `getUser()` to refresh
 * the session on this request.
 *
 * Use `getSupabaseAuthServerClient()` + `auth.getUser()` instead for
 * sensitive operations (account settings, billing) where server-side
 * token validation is required.
 */
export async function getSupabaseSession(): Promise<{
  userId: string | null;
  supabase: SupabaseAuthServerClient;
}> {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { userId: session?.user?.id ?? null, supabase };
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/lib/supabaseAuthServerClient.ts
git commit -m "feat: add getSupabaseSession() helper for cookie-based auth checks"
```

---

### Task 2: Switch `app/page.tsx` to `getSupabaseSession()`

**Files:**

- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the auth check**

Change the import from:

```typescript
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
```

to:

```typescript
import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
```

Replace the body of `Home()`:

```typescript
export default async function Home() {
  let isAuthenticated = false;

  try {
    const { userId } = await getSupabaseSession();
    isAuthenticated = !!userId;
  } catch {
    // Auth check failed — treat as unauthenticated
  }

  if (isAuthenticated) {
    redirect('/sets');
  }

  return (
    <LandingPage
      plusMonthlyPriceId={process.env.STRIPE_PRICE_PLUS_MONTHLY ?? ''}
      plusYearlyPriceId={process.env.STRIPE_PRICE_PLUS_YEARLY ?? ''}
    />
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify manually** — load `/` in browser, confirm redirect works when logged in and landing page shows when logged out.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "perf: use getSession() instead of getUser() on home page"
```

---

### Task 3: Switch `app/pricing/page.tsx` to `getSupabaseSession()`

**Files:**

- Modify: `app/pricing/page.tsx`

- [ ] **Step 1: Replace the auth check**

Change the import from:

```typescript
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
```

to:

```typescript
import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
```

Replace the function body. Note: the `supabase` client is still needed for the `billing_subscriptions` query:

```typescript
export default async function PricingPage() {
  let tier: 'free' | 'plus' | 'pro' = 'free';
  let isAuthenticated = false;
  let subscriptionStatus: string | null = null;
  let hadPriorSubscription = false;

  try {
    const { userId, supabase } = await getSupabaseSession();

    if (userId) {
      isAuthenticated = true;
      const entitlements = await getEntitlements(userId);
      tier = entitlements.tier;

      const { data: sub } = await supabase
        .from('billing_subscriptions')
        .select('status')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing', 'past_due', 'canceled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subscriptionStatus = sub?.status ?? null;

      // Check for any prior subscription (regardless of status) for trial eligibility
      const { data: priorSub } = await supabase
        .from('billing_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      hadPriorSubscription = !!priorSub;
    }
  } catch {
    // Swallow -- default to free/unauth
  }

  return (
    <PricingPageClient
      tier={tier}
      isAuthenticated={isAuthenticated}
      subscriptionStatus={subscriptionStatus}
      hadPriorSubscription={hadPriorSubscription}
      plusMonthlyPriceId={process.env.STRIPE_PRICE_PLUS_MONTHLY ?? ''}
      plusYearlyPriceId={process.env.STRIPE_PRICE_PLUS_YEARLY ?? ''}
    />
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/pricing/page.tsx
git commit -m "perf: use getSession() instead of getUser() on pricing page"
```

---

### Task 4: Switch `app/collection/page.tsx` to `getSupabaseSession()`

**Files:**

- Modify: `app/collection/page.tsx`

- [ ] **Step 1: Replace the auth check**

Change the import from:

```typescript
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
```

to:

```typescript
import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
```

Replace the function body:

```typescript
export default async function CollectionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  let userId: string | null = null;
  let username: string | null = null;

  try {
    const { userId: sessionUserId, supabase } = await getSupabaseSession();

    if (sessionUserId) {
      userId = sessionUserId;
      username = await getUserUsername(supabase, sessionUserId);
    }
  } catch {
    userId = null;
    username = null;
  }

  const resolvedSearch = searchParams ? await searchParams : {};

  if (!userId) {
    return (
      <PageLayout>
        <CollectionHero />
        <section className="container-default py-8">
          <SignInPrompt
            title="Create an account to track your collection"
            description="Search, Identify, and Search Party work without an account, but managing lists of sets and minifigures requires signing in."
            buttonText="Sign in to manage your collection"
          />
        </section>
      </PageLayout>
    );
  }

  const handle = buildUserHandle({
    user_id: userId,
    username,
  });

  const qs = buildSearchQueryString(resolvedSearch);
  const target = qs ? `/collection/${handle}?${qs}` : `/collection/${handle}`;

  redirect(target);
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/collection/page.tsx
git commit -m "perf: use getSession() instead of getUser() on collection page"
```

---

### Task 5: Switch `app/collection/[handle]/page.tsx` to `getSupabaseSession()`

**Files:**

- Modify: `app/collection/[handle]/page.tsx`

- [ ] **Step 1: Replace the auth import and call**

Change the import from:

```typescript
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
```

to:

```typescript
import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
```

Replace the auth block inside `CollectionHandlePage` (lines 145-160 of current file). Find this code:

```typescript
const supabaseAuth = await getSupabaseAuthServerClient();
let currentUserId: string | null = null;
let currentUsername: string | null = null;

try {
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (user) {
    currentUserId = user.id;
    currentUsername = await getUserUsername(supabaseAuth, user.id);
  }
} catch {
  // ignore auth errors
}
```

Replace with:

```typescript
let currentUserId: string | null = null;
let currentUsername: string | null = null;

try {
  const { userId, supabase: supabaseAuth } = await getSupabaseSession();

  if (userId) {
    currentUserId = userId;
    currentUsername = await getUserUsername(supabaseAuth, userId);
  }
} catch {
  // ignore auth errors
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/collection/[handle]/page.tsx
git commit -m "perf: use getSession() instead of getUser() on collection/[handle] page"
```

---

### Task 6: Switch `app/identify/page.tsx` to `getSupabaseSession()` + Parallelize

**Files:**

- Modify: `app/identify/page.tsx`

This task combines two optimizations: switching to `getSession()` AND parallelizing `getEntitlements` + `getUsageStatus`.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/identify/page.tsx`:

```typescript
import { getEntitlements } from '@/app/lib/services/entitlements';
import { getUsageStatus } from '@/app/lib/services/usageCounters';
import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
import type { Metadata } from 'next';
import IdentifyClient from './IdentifyClient';

export const metadata: Metadata = {
  title: 'Identify Parts & Minifigs | Brick Party',
  description:
    'Upload a photo or enter a part number to identify LEGO pieces and find sets they appear in',
};

export default async function IdentifyPage() {
  const { userId } = await getSupabaseSession();

  if (!userId) {
    return (
      <IdentifyClient
        initialQuota={{ status: 'unauthorized' }}
        isAuthenticated={false}
      />
    );
  }

  // Fetch entitlements and usage in parallel — both only need userId.
  // For unlimited-tier users the usage result is discarded, but the
  // parallelism saves more time than the redundant DB read costs.
  const [entitlements, usage] = await Promise.all([
    getEntitlements(userId),
    getUsageStatus({
      userId,
      featureKey: 'identify:daily',
      windowKind: 'daily',
      limit: 5,
    }),
  ]);

  if (entitlements.features.includes('identify.unlimited')) {
    return (
      <IdentifyClient
        initialQuota={{ status: 'unlimited', tier: entitlements.tier }}
        isAuthenticated
      />
    );
  }

  return (
    <IdentifyClient
      initialQuota={{
        status: 'metered',
        tier: entitlements.tier,
        limit: usage.limit,
        remaining: usage.remaining,
        resetAt: usage.resetAt,
      }}
      isAuthenticated
    />
  );
}
```

Note: the `supabase` client is no longer passed to `getEntitlements` or `getUsageStatus` — both fall back to `getSupabaseServiceRoleClient()` internally, which is correct for these service-role operations.

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify manually** — load `/identify` in browser while logged in. Confirm quota info displays correctly.

- [ ] **Step 4: Commit**

```bash
git add app/identify/page.tsx
git commit -m "perf: use getSession() and parallelize entitlements+usage on identify page"
```

---

### Task 7: Remove `force-dynamic` from Search Page

**Files:**

- Modify: `app/search/page.tsx`

- [ ] **Step 1: Remove the export**

Delete this line from `app/search/page.tsx`:

```typescript
export const dynamic = 'force-dynamic';
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/search/page.tsx
git commit -m "perf: remove unnecessary force-dynamic from search page"
```

---

### Task 8: Remove `revalidate = 0` from User Profile Page

**Files:**

- Modify: `app/user/[handle]/page.tsx`

- [ ] **Step 1: Remove the export**

Delete this line from `app/user/[handle]/page.tsx`:

```typescript
export const revalidate = 0;
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/user/[handle]/page.tsx
git commit -m "perf: remove redundant revalidate=0 from user profile page"
```

---

### Task 9: Set Sentry `tracesSampleRate` to 0

**Files:**

- Modify: `sentry.server.config.ts`
- Modify: `sentry.edge.config.ts`

- [ ] **Step 1: Update server config**

In `sentry.server.config.ts`, change:

```typescript
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
```

to:

```typescript
  tracesSampleRate: 0,
```

- [ ] **Step 2: Update edge config**

In `sentry.edge.config.ts`, make the same change:

```typescript
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
```

to:

```typescript
  tracesSampleRate: 0,
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add sentry.server.config.ts sentry.edge.config.ts
git commit -m "perf: disable Sentry tracing to reduce per-request overhead"
```

---

### Task 10: Cache CSP String in Middleware

**Files:**

- Modify: `utils/supabase/middleware.ts`

- [ ] **Step 1: Cache the CSP string at module level**

After the `buildRelaxedCsp` function definition, add:

```typescript
/** CSP is deterministic per NODE_ENV — compute once and reuse. */
const RELAXED_CSP = buildRelaxedCsp();
```

- [ ] **Step 2: Use the cached value**

In the `updateSession` function, change:

```typescript
response.headers.set('Content-Security-Policy', buildRelaxedCsp());
```

to:

```typescript
response.headers.set('Content-Security-Policy', RELAXED_CSP);
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add utils/supabase/middleware.ts
git commit -m "perf: cache CSP header string at module level"
```

---

## Verification

After all tasks are complete:

- [ ] Run `npx tsc --noEmit` — full type check
- [ ] Run `npm run lint` — no lint errors
- [ ] Run `npm test -- --run` — all tests pass
- [ ] Manual smoke test: navigate between /, /search, /identify, /collection, /pricing — confirm no regressions and pages feel faster
