# Serverless Performance Optimization

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Code-level fixes to reduce SSR and middleware latency. Platform migration (Netlify -> Vercel) is handled separately by the user.

## Problem

Netlify function stats show p50 ~457ms and p95 ~5.5s for the Next.js server handler. Users experience ~1 second delays when navigating between top-level pages. The root causes are:

1. **Double auth calls** — middleware calls `supabase.auth.getUser()` (network roundtrip) on every request, then 7 SSR pages call it again
2. **Unnecessary dynamic rendering** — search page forces serverless execution despite doing no server-side data fetching
3. **Sequential SSR calls** — identify page makes 3 serial Supabase roundtrips
4. **Sentry tracing overhead** — 10% of requests get full performance traces
5. **CSP string rebuilt per-request** — deterministic output recomputed unnecessarily
6. **Redundant `revalidate = 0`** — user profile page opts out of caching unnecessarily

## Changes

### 1. Switch 5 Pages from `getUser()` to `getSession()`

**Why:** Middleware already calls `getUser()` to refresh auth cookies. Pages that only need the user ID or auth status can read the JWT from the cookie via `getSession()` — no network call.

**Files changed:**

- `app/lib/supabaseAuthServerClient.ts` — add `getSupabaseSession()` helper that creates a Supabase SSR client (same as `getSupabaseAuthServerClient`), calls `supabase.auth.getSession()`, and returns `{ userId: string | null }`. This avoids the network roundtrip of `getUser()` by reading the JWT directly from cookies.
- `app/page.tsx` — switch to `getSession()` (just checks auth for redirect)
- `app/pricing/page.tsx` — switch to `getSession()` (just checks auth for UI variant)
- `app/collection/page.tsx` — switch to `getSession()` (just gets userId for redirect)
- `app/collection/[handle]/page.tsx` — switch to `getSession()` (just gets userId for owner check)
- `app/identify/page.tsx` — switch to `getSession()` (just gets userId for entitlement lookup)

**Pages that keep `getUser()`:**

- `app/account/page.tsx` — sensitive profile data
- `app/billing/success/page.tsx` — financial operation

**Security note:** `getSession()` reads the JWT without server-side validation. This is safe because middleware has already validated and refreshed the token on this same request. Pages using `getSession()` only use the userId for non-sensitive lookups (redirects, entitlement checks). Sensitive operations (account settings, billing) continue using `getUser()`.

### 2. Remove `force-dynamic` from Search Page

**Why:** `app/search/page.tsx` does zero server-side data fetching. `SearchBar` and `SearchResults` are client components that fetch via API routes. The `force-dynamic` export was added to address an unrelated caching issue and never removed.

**Files changed:**

- `app/search/page.tsx` — remove `export const dynamic = 'force-dynamic'`

**Behavior:** The page still renders dynamically per-request because it reads `searchParams`, but Next.js can apply framework-level optimizations (streaming, partial caching) that `force-dynamic` explicitly prevented.

### 3. Parallelize Identify Page SSR

**Why:** The identify page currently makes 3 sequential Supabase calls: `getSession()` -> `getEntitlements()` -> `getUsageStatus()`. The last two are independent — both only need the userId.

**Files changed:**

- `app/identify/page.tsx` — run `getEntitlements()` and `getUsageStatus()` via `Promise.all()`, then check entitlements result to decide response

**Before:** 3 serial roundtrips (~150-300ms)
**After:** 2 serial roundtrips — session, then parallel entitlements+usage (~100-200ms)

**Trade-off:** For unlimited-tier users, the usage query is fetched but discarded. This is a fast DB read and the time saved by parallelism outweighs the wasted query.

### 4. Set Sentry `tracesSampleRate` to 0

**Why:** Sentry performance tracing adds overhead to 10% of requests (current `tracesSampleRate: 0.1`). Error capture — the valuable part — works regardless of trace sampling.

**Files changed:**

- `sentry.server.config.ts` — set `tracesSampleRate: 0`
- `sentry.edge.config.ts` — set `tracesSampleRate: 0`

**Behavior:** Unhandled exceptions still captured and reported. Performance traces disabled. Can be re-enabled temporarily for investigation by bumping the rate.

### 5. Cache CSP String in Middleware

**Why:** `buildRelaxedCsp()` produces a deterministic string (only varies by `NODE_ENV`, which is fixed per process). Currently rebuilt on every request.

**Files changed:**

- `utils/supabase/middleware.ts` — compute CSP string once at module load, reuse cached value

### 6. Remove `revalidate = 0` from User Profile Page

**Why:** `app/user/[handle]/page.tsx` has `export const revalidate = 0` which is redundant. The page has a dynamic segment (`[handle]`) and does async data fetching, so Next.js already renders it dynamically. The explicit opt-out prevents any future framework caching optimizations.

**Files changed:**

- `app/user/[handle]/page.tsx` — remove `export const revalidate = 0`

## Expected Impact

| Change                          | Estimated Savings                            | Frequency                           |
| ------------------------------- | -------------------------------------------- | ----------------------------------- |
| `getSession()` over `getUser()` | 50-150ms per page                            | Every SSR navigation to 5 pages     |
| Remove `force-dynamic`          | ~0ms direct, enables framework optimizations | Every search navigation             |
| Parallelize identify SSR        | 50-100ms                                     | Every identify page load            |
| Sentry traces off               | ~10-50ms on 10% of requests                  | Every request (eliminates overhead) |
| Cache CSP string                | ~1-5ms                                       | Every request                       |
| Remove `revalidate = 0`         | ~0ms direct, enables framework optimizations | Every user profile load             |

Combined with the Vercel migration (which eliminates cold start overhead), p50 navigation should drop from ~1s to ~200-300ms.

## Out of Scope

- Vercel migration (user handles separately)
- `netlify.toml` configuration (irrelevant after migration)
- Heavy SSR on collection/[handle] page (already uses `Promise.all`, optimization would require architectural change)
- API route performance (search, pricing, inventory — separate concern from SSR navigation)
