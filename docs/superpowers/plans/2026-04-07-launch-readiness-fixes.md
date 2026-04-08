# Launch Readiness Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, high, and medium issues found in the pre-launch code review.

**Architecture:** Targeted fixes across error handling, security hardening, accessibility, and infrastructure config. No new features — just making the existing app launch-ready.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase, Stripe, Sentry, Tailwind v4, @serwist/next (replacing next-pwa)

---

## File Map

| Action | File                                                    | Responsibility                                      |
| ------ | ------------------------------------------------------- | --------------------------------------------------- |
| Create | `app/error.tsx`                                         | Route-level error boundary with playful brick theme |
| Create | `app/not-found.tsx`                                     | Custom 404 with same playful theme                  |
| Create | `sentry.client.config.ts`                               | Client-side Sentry initialization                   |
| Create | `app/search/loading.tsx`                                | BrickLoader while search page loads                 |
| Create | `app/sets/[setNumber]/loading.tsx`                      | BrickLoader while set page loads                    |
| Create | `app/identify/loading.tsx`                              | BrickLoader while identify page loads               |
| Create | `app/account/loading.tsx`                               | BrickLoader while account page loads                |
| Modify | `sentry.server.config.ts`                               | Add environment tagging                             |
| Modify | `sentry.edge.config.ts`                                 | Add environment tagging                             |
| Modify | `app/global-error.tsx`                                  | Support dark mode                                   |
| Modify | `app/lib/services/minifigSync.ts:75-78,130-133,150-153` | Batch `.in()` queries at 200                        |
| Modify | `app/lib/catalog/minifigs.ts:506-510`                   | Batch `.in()` at 200 instead of 4000                |
| Modify | `app/api/feedback/route.ts:26-37`                       | Fix sanitizer regex ordering                        |
| Modify | `app/api/inventory/route.ts:21`                         | Add IP-based rate limiting                          |
| Modify | `app/api/search/minifigs/route.ts:45`                   | Add IP-based rate limiting                          |
| Modify | `app/components/ui/Modal.tsx`                           | Add focus trap                                      |
| Modify | `next.config.ts:96-113`                                 | Add HSTS header                                     |
| Modify | `middleware.ts`                                         | Redirect unauthenticated users from /account        |
| Modify | `app/lib/services/billing.ts:293,321-327`               | Validate BillingTier from DB                        |
| Modify | `package.json:4`                                        | Fix `"private": "true"` → `true`                    |
| Modify | `.env.local.example`                                    | Add all required env vars                           |

---

### Task 1: Error and Not-Found Pages

**Files:**

- Create: `app/error.tsx`
- Create: `app/not-found.tsx`
- Modify: `app/global-error.tsx`

- [ ] **Step 1: Create `app/error.tsx`**

This is the route-level error boundary. Playful "stepped on a brick" theme with a link to search. Must be a client component. Uses Tailwind classes (has access to the full layout/theme unlike `global-error.tsx`).

```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
        Ouch!
      </h1>
      <p className="mb-1 text-2xl font-semibold text-foreground sm:text-3xl">
        You stepped on a brick!
      </p>
      <p className="mb-8 text-lg text-foreground-muted">
        Something went wrong. Try{' '}
        <Link
          href="/search"
          className="hover:text-theme-primary-hover text-theme-primary underline underline-offset-2"
        >
          searching for a set
        </Link>{' '}
        instead?
      </p>
      <button
        onClick={() => reset()}
        className="rounded-lg border-2 border-theme-primary bg-transparent px-6 py-2 text-sm font-medium text-theme-primary transition-colors hover:bg-theme-primary hover:text-white"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/not-found.tsx`**

Same playful theme but no `reset` button (nothing to retry). This is a server component.

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
        Ouch!
      </h1>
      <p className="mb-1 text-2xl font-semibold text-foreground sm:text-3xl">
        You stepped on a brick!
      </p>
      <p className="mb-8 text-lg text-foreground-muted">
        This page could not be found. Try{' '}
        <Link
          href="/search"
          className="hover:text-theme-primary-hover text-theme-primary underline underline-offset-2"
        >
          searching for a set
        </Link>{' '}
        instead?
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Update `app/global-error.tsx` for dark mode**

Replace hardcoded colors with a `prefers-color-scheme` media query. `global-error.tsx` renders outside the theme provider so it must use inline styles with media query detection or CSS variables.

```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #1a1a2e; color: #e0e0e0; }
            .ge-card { background: #2a1a1a; border-color: #e3000b; }
            .ge-text { color: #e0e0e0; }
            .ge-btn { background: #2a1a1a; }
          }
        `}</style>
      </head>
      <body style={{ margin: 0 }}>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className="ge-card"
            style={{
              maxWidth: '28rem',
              borderRadius: '0.5rem',
              border: '2px solid #e3000b',
              backgroundColor: '#fef2f2',
              padding: '1.5rem',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                marginBottom: '0.5rem',
                fontSize: '1.5rem',
                fontWeight: 800,
                color: '#e3000b',
              }}
            >
              Ouch! You stepped on a brick!
            </h2>
            <p
              className="ge-text"
              style={{
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              Something went seriously wrong. Please try again.
            </p>
            <button
              onClick={() => reset()}
              className="ge-btn"
              style={{
                borderRadius: '0.375rem',
                border: '2px solid #e3000b',
                backgroundColor: '#ffffff',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                color: '#e3000b',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify locally**

Navigate to a broken URL to test not-found. Temporarily throw in a page component to test error boundary.

- [ ] **Step 5: Commit**

```bash
git add app/error.tsx app/not-found.tsx app/global-error.tsx
git commit -m "add playful error + not-found pages, fix dark mode in global-error"
```

---

### Task 2: Sentry Client Config + Environment Tagging

**Files:**

- Create: `sentry.client.config.ts`
- Modify: `sentry.server.config.ts`
- Modify: `sentry.edge.config.ts`

- [ ] **Step 1: Create `sentry.client.config.ts`**

Match the existing server/edge pattern but with client-appropriate settings.

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

- [ ] **Step 2: Add environment to `sentry.server.config.ts`**

Add `environment` line after `dsn`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

- [ ] **Step 3: Add environment to `sentry.edge.config.ts`**

Same change — add `environment` line:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

- [ ] **Step 4: Commit**

```bash
git add sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts
git commit -m "add client-side Sentry config, tag all Sentry envs"
```

---

### Task 3: Loading Pages with BrickLoader

**Files:**

- Create: `app/search/loading.tsx`
- Create: `app/sets/[setNumber]/loading.tsx`
- Create: `app/identify/loading.tsx`
- Create: `app/account/loading.tsx`

All four loading files use the same pattern — a centered BrickLoader. These are server components (no `'use client'` needed because BrickLoader has its own `'use client'` directive).

- [ ] **Step 1: Create `app/search/loading.tsx`**

```tsx
import { BrickLoader } from '@/app/components/ui/BrickLoader';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrickLoader size="lg" />
    </div>
  );
}
```

- [ ] **Step 2: Create `app/sets/[setNumber]/loading.tsx`**

Same content as step 1.

```tsx
import { BrickLoader } from '@/app/components/ui/BrickLoader';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrickLoader size="lg" />
    </div>
  );
}
```

- [ ] **Step 3: Create `app/identify/loading.tsx`**

Same content as step 1.

```tsx
import { BrickLoader } from '@/app/components/ui/BrickLoader';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrickLoader size="lg" />
    </div>
  );
}
```

- [ ] **Step 4: Create `app/account/loading.tsx`**

Same content as step 1.

```tsx
import { BrickLoader } from '@/app/components/ui/BrickLoader';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrickLoader size="lg" />
    </div>
  );
}
```

- [ ] **Step 5: Verify locally**

Navigate between routes — search, set detail, identify, account. Confirm BrickLoader appears during route transitions.

- [ ] **Step 6: Commit**

```bash
git add app/search/loading.tsx app/sets/\[setNumber\]/loading.tsx app/identify/loading.tsx app/account/loading.tsx
git commit -m "add BrickLoader loading states for key routes"
```

---

### Task 4: Batch `.in()` Queries in minifigSync

**Files:**

- Modify: `app/lib/services/minifigSync.ts`
- Modify: `app/lib/catalog/minifigs.ts`

The Supabase `.in()` operator encodes values into the URL query string. Arrays >200 items hit URL length limits (414 errors). Three call sites in minifigSync.ts and one in minifigs.ts need batching.

- [ ] **Step 1: Add a `batchedIn` helper to minifigSync.ts**

Add this helper at the top of the file (after imports, before the first function). It batches `.in()` queries and merges results.

```ts
const IN_BATCH_SIZE = 200;

/** Batch a Supabase `.in()` query to avoid URL length limits. */
async function batchedIn<T>(
  table: ReturnType<typeof catalogClient.from>,
  column: string,
  values: string[],
  select: string
): Promise<
  { data: T[]; error: null } | { data: null; error: { message: string } }
> {
  const allData: T[] = [];
  for (let i = 0; i < values.length; i += IN_BATCH_SIZE) {
    const batch = values.slice(i, i + IN_BATCH_SIZE);
    const { data, error } = await table.select(select).in(column, batch);
    if (error) return { data: null, error };
    allData.push(...(data as T[]));
  }
  return { data: allData, error: null };
}
```

Note: The exact type for `table` will depend on how it's called. In practice, since each call site already has the `.from()` call, it's simpler to just inline the batching loop at each call site rather than fighting Supabase's generic types. Follow the pattern used in `minifigs.ts:97-107` which already does this correctly.

- [ ] **Step 2: Batch the inventories query (line ~78)**

Replace the direct `.in('set_num', setNums)` call with a batching loop:

```ts
// Batch .in() at 200 to avoid URL length limits
const allInventories: typeof inventories = [];
for (let i = 0; i < setNums.length; i += 200) {
  const batch = setNums.slice(i, i + 200);
  const { data, error } = await catalogClient
    .from('rb_inventories')
    .select('id, set_num, version')
    .in('set_num', batch)
    .not('set_num', 'like', 'fig-%');
  if (error) {
    logger.error('user_minifigs.sync_from_sets.inventories_failed', {
      userId,
      error: error.message,
    });
    return null;
  }
  allInventories.push(...(data ?? []));
}
const inventories = allInventories;
```

- [ ] **Step 3: Batch the inventory_minifigs query (line ~133)**

Replace `.in('inventory_id', invIds)` with a batching loop. Same pattern — loop in chunks of 200.

- [ ] **Step 4: Batch the rb_minifigs query (line ~153)**

Replace `.in('fig_num', figNums)` with a batching loop. Same pattern.

- [ ] **Step 5: Fix `minifigs.ts:510` — change slice from 4000 to 200 with batching**

In `app/lib/catalog/minifigs.ts`, around line 506-510, the code does:

```ts
.in('fig_num', figNumsForCount.slice(0, 4000));
```

Replace with a batching loop at 200, matching the pattern already used at lines 97-107 of the same file:

```ts
  if (figNumsForCount.length > 0) {
    const partCountBatches: Promise<{ fig_num: string }[]>[] = [];
    for (let i = 0; i < figNumsForCount.length; i += 200) {
      const batch = figNumsForCount.slice(i, i + 200);
      partCountBatches.push(
        supabase
          .from('rb_minifig_parts')
          .select('fig_num')
          .in('fig_num', batch)
          .then(({ data }) => data ?? [])
      );
    }
    const partCounts = (await Promise.all(partCountBatches)).flat();
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add app/lib/services/minifigSync.ts app/lib/catalog/minifigs.ts
git commit -m "batch .in() queries at 200 to prevent URL length errors"
```

---

### Task 5: Fix Feedback Sanitizer Ordering

**Files:**

- Modify: `app/api/feedback/route.ts`

The script-content regex runs after the HTML tag regex already stripped the `<script>` tags, so it can never match. Swap the order, or simplify since Zod already validates and the output is never rendered as HTML.

- [ ] **Step 1: Fix sanitizer in `app/api/feedback/route.ts:26-37`**

The simplest correct fix is to run the script-content strip first (before generic tag strip):

```ts
function sanitizeInput(input: string): string {
  return (
    input
      // Strip script content (must run before generic tag strip)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Strip remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Normalize whitespace (collapse multiple spaces/newlines)
      .replace(/\s+/g, ' ')
      .trim()
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/feedback/route.ts
git commit -m "fix feedback sanitizer: strip script content before tags"
```

---

### Task 6: Add Rate Limiting to Unprotected Endpoints

**Files:**

- Modify: `app/api/inventory/route.ts`
- Modify: `app/api/search/minifigs/route.ts`

Both endpoints are public and unauthenticated. Follow the existing pattern from `app/api/search/route.ts` which uses `consumeRateLimit` + `getClientIp` with `RATE_LIMIT.SEARCH_MAX`.

- [ ] **Step 1: Add rate limiting to `app/api/inventory/route.ts`**

Add imports at the top:

```ts
import { RATE_LIMIT } from '@/app/lib/constants';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
```

Add rate limit check at the start of the `GET` handler, before validation:

```ts
export async function GET(req: NextRequest) {
  // IP-based rate limit
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`inventory:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.SEARCH_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  // ... existing validation and handler code
```

- [ ] **Step 2: Add rate limiting to `app/api/search/minifigs/route.ts`**

Same pattern. Add imports:

```ts
import { RATE_LIMIT } from '@/app/lib/constants';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
```

Add rate limit check at the start of `GET`:

```ts
export async function GET(req: NextRequest) {
  // IP-based rate limit
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`search-minifigs:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.SEARCH_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  // ... existing validation and handler code
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/inventory/route.ts app/api/search/minifigs/route.ts
git commit -m "add IP rate limiting to inventory and minifig search endpoints"
```

---

### Task 7: Modal Focus Trap

**Files:**

- Modify: `app/components/ui/Modal.tsx`

Add a focus trap so Tab/Shift+Tab cycle stays within the modal while open. Use a lightweight approach with no new dependencies — query focusable elements and wrap around.

- [ ] **Step 1: Add focus trap to `app/components/ui/Modal.tsx`**

Replace the entire file:

```tsx
'use client';

import React, { ReactNode, useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '@/app/hooks/useScrollLock';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Capture focus origin and move focus into modal on open
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Defer so the portal DOM is ready
    const raf = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      // Restore focus when modal closes
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap: wrap Tab at edges
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useScrollLock(open);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 pt-4 pb-[calc(1rem+var(--spacing-nav-height))] lg:pt-[calc(1rem+var(--spacing-nav-height))] lg:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={e => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-subtle bg-card shadow-xl"
        style={{ maxHeight: 'calc(100dvh - var(--spacing-nav-height) - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-subtle px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-foreground-muted transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Test manually**

Open any modal (e.g., set detail, export). Tab through — focus should cycle within the modal. Shift+Tab from the first element should wrap to the close button. Press Escape to close — focus should return to the element that opened it.

- [ ] **Step 3: Commit**

```bash
git add app/components/ui/Modal.tsx
git commit -m "add focus trap and focus restoration to Modal"
```

---

### Task 8: HSTS Header

**Files:**

- Modify: `next.config.ts`

- [ ] **Step 1: Add HSTS to security headers in `next.config.ts:100-110`**

Add to the headers array inside the `/:path*` source block, after the existing `X-Frame-Options` entry:

```ts
{
  key: 'Strict-Transport-Security',
  value: 'max-age=63072000; includeSubDomains; preload',
},
```

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "add HSTS header for custom domain security"
```

---

### Task 9: Middleware Protection for /account

**Files:**

- Modify: `middleware.ts`
- Read: `utils/supabase/middleware.ts` (to understand how auth state is resolved)

The `updateSession` function already refreshes the Supabase session. We need to redirect unauthenticated users away from `/account` at the middleware level.

- [ ] **Step 1: Read `utils/supabase/middleware.ts` to understand the session refresh pattern**

Understand how `updateSession` works and what response it returns. We need to add a redirect after the session refresh when the path starts with `/account` and the user is not authenticated.

- [ ] **Step 2: Update `middleware.ts`**

After the session refresh, check if the user is visiting `/account` unauthenticated:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // Protect /account — redirect unauthenticated users to landing page
  if (request.nextUrl.pathname.startsWith('/account')) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

Note: Check how `updateSession` exposes the user. If it already reads the user and includes it in the response, avoid a second `getUser()` call. The implementation may need adjustment based on the actual `updateSession` return value. If `updateSession` already embeds user state in cookies, you can read from those cookies directly.

- [ ] **Step 3: Test locally**

Visit `/account` while logged out — should redirect to `/`. Visit while logged in — should render normally.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "redirect unauthenticated users from /account in middleware"
```

---

### Task 10: BillingTier Type Safety

**Files:**

- Modify: `app/lib/services/billing.ts`

The `tier` column comes from the DB as `string | null` and is cast to `BillingTier` without validation. Add a type guard.

- [ ] **Step 1: Add a `isBillingTier` guard to `billing.ts`**

Add near the type definition at line 11:

```ts
export type BillingTier = 'free' | 'plus' | 'pro';

const BILLING_TIERS: ReadonlySet<string> = new Set<BillingTier>([
  'free',
  'plus',
  'pro',
]);

export function isBillingTier(value: unknown): value is BillingTier {
  return typeof value === 'string' && BILLING_TIERS.has(value);
}
```

- [ ] **Step 2: Use the guard at line ~293 (override lookup)**

Replace:

```ts
return (override?.tier as BillingTier) ?? null;
```

With:

```ts
return isBillingTier(override?.tier) ? override.tier : null;
```

- [ ] **Step 3: Use the guard at line ~326 (subscription loop)**

Replace:

```ts
if (tierRank[row.tier as BillingTier] > tierRank[bestTier]) {
  bestTier = row.tier as BillingTier;
}
```

With:

```ts
if (isBillingTier(row.tier) && tierRank[row.tier] > tierRank[bestTier]) {
  bestTier = row.tier;
}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/services/billing.ts
git commit -m "validate BillingTier from DB instead of unsafe cast"
```

---

### Task 11: Replace next-pwa with @serwist/next

**Files:**

- Modify: `package.json`
- Modify: `next.config.ts`

`next-pwa@5.6.0` is unmaintained (last release 2022) and incompatible with Next.js 15. `@serwist/next` is the actively maintained successor with the same API surface.

- [ ] **Step 1: Uninstall next-pwa, install @serwist/next**

```bash
npm uninstall next-pwa && npm install @serwist/next
```

- [ ] **Step 2: Update `next.config.ts`**

Replace the `next-pwa` import and config with `@serwist/next`. The API is nearly identical:

```ts
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});
```

Note: `@serwist/next` uses a different configuration shape than `next-pwa`. The runtime caching config needs to move into a service worker source file (`app/sw.ts`). Check the `@serwist/next` docs for the exact migration path. The key difference is that `@serwist/next` requires an explicit service worker file.

- [ ] **Step 3: Create `app/sw.ts` service worker**

```ts
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,
    {
      urlPattern: /^https:\/\/cdn\.rebrickable\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'rebrickable-images',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      urlPattern: /^https:\/\/img\.bricklink\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'bricklink-images',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-storage-images',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
```

- [ ] **Step 4: Update `next.config.ts` wrapper**

Replace `withPWA(nextConfig)` with `withSerwist(nextConfig)` in the export. Remove the old `withPWAInit` import and config block entirely.

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: Successful build with service worker generated.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts app/sw.ts
git commit -m "replace unmaintained next-pwa with @serwist/next"
```

---

### Task 12: Small Fixes (package.json, .env.local.example)

**Files:**

- Modify: `package.json`
- Modify: `.env.local.example`

- [ ] **Step 1: Fix `package.json` private field**

Change line 4 from `"private": "true"` to `"private": true` (boolean, not string).

- [ ] **Step 2: Update `.env.local.example`**

Replace with a complete template covering all required env vars:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Rebrickable
REBRICKABLE_API=

# BrickLink OAuth 1.0
BRICKLINK_CONSUMER_KEY=
BRICKLINK_CONSUMER_SECRET=
BRICKLINK_TOKEN=
BRICKLINK_TOKEN_SECRET=

# Brickognize (Identify)
BRICKOGNIZE_ENDPOINT=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PLUS_MONTHLY=
# STRIPE_PRICE_PLUS_YEARLY=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 3: Commit**

```bash
git add package.json .env.local.example
git commit -m "fix package.json private field, complete .env.local.example"
```

---

## Execution Order

Tasks are independent and can be executed in any order. For maximum parallelism with subagent-driven development:

- **Parallel batch 1:** Tasks 1, 2, 3 (error pages, Sentry, loading states) — no shared files
- **Parallel batch 2:** Tasks 4, 5, 6 (batching, sanitizer, rate limits) — no shared files
- **Parallel batch 3:** Tasks 7, 8, 9, 10 (modal, HSTS, middleware, billing) — no shared files
- **Sequential:** Task 11 (PWA swap — touches next.config.ts which Task 8 also modifies, so run after)
- **Final:** Task 12 (small fixes)
