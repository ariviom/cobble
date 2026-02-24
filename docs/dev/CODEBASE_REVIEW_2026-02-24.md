# Brick Party Codebase Review Report

**Date:** February 24, 2026
**Scope:** ~45K LOC across 365 files — API layer, services/domain, client state, security, performance, Supabase schema/RLS, and runtime profiling
**Method:** 6 parallel code review agents + Playwright runtime profiling against dev server

---

## Critical (9 findings — fix before launch)

### ~~C1. BrickLink concurrency slot leak → eventual deadlock~~ ✅

**`app/lib/bricklink.ts:217-288`** — Fixed: wrapped both `fetch()` and response parsing in a single outer `try/finally` with `releaseSlot()`.

---

### ~~C2. Supabase query builder `.eq()` return value discarded — color filters silently dropped~~ ✅

**`app/lib/catalog/sets.ts:725-738`** — Fixed: changed `const` to `let` for `directQuery`/`figQuery` and reassigned from `.eq()`.

---

### C3. Mobile data loss — `flushAllPendingWrites` is fire-and-forget on unload

**`app/store/owned.ts:100-110`**

`flushAllPendingWrites` is called on `beforeunload`, `pagehide`, and `visibilitychange`. It fires async IndexedDB writes via `flushWriteToIndexedDB`, but iOS Safari kills the page immediately after the event fires. The async chain is suspended and pending owned changes are silently lost.

**Fix:** Persist pending writes to `localStorage` synchronously inside the unload handler as a fallback, then reconcile from localStorage on next page load. The SyncWorker's `sendBeacon` approach is the right model.

---

### C4. Cross-user data leak after logout → login

**`app/store/owned.ts:240-297`**

`resetOwnedCache` clears `hydrationPromises` but does not cancel in-flight async operations. A `hydrateFromIndexedDB` promise started for User A can resolve after User B logs in, writing User A's owned data into the cache.

**Fix:** Add a generation/epoch counter incremented in `resetOwnedCache`. Each hydration promise captures the epoch at start and checks it before writing to cache.

---

### ~~C5. Inventory render cascade + identify DOM explosion~~ ✅

**`app/components/set/Inventory.tsx`**, **`app/hooks/useInventoryViewModel.ts`**, **`app/components/identify/IdentifySetList.tsx`**

Originally reported as 28K DOM nodes on identify and 7.3s blocking on inventory. Addressed with targeted fixes instead of full virtualization (virtualization was ruled out due to complexity across 6 view modes × group headers × dynamic row heights):

- **Identify results:** Added client-side infinite scroll (IntersectionObserver, 50 items/page, 600px rootMargin). Reduces initial DOM from ~28K to ~1.4K nodes.
- **Inventory render cascade:** Gated `ownedByKey` dependency in `visibleIndices` so owned changes don't trigger O(n) filter+sort when display='all' (the default). Lifted `useAuth`/`useOptionalSearchParty` out of each InventoryItem (300+ identical hook calls → 1 each). Removed `renderInventoryItem` useCallback + `renderedItems` useMemo layers.
- **Residual cost:** ~27 DOM nodes per inventory item. Sets under 1K parts (~27K nodes) are fine. 4K+ part sets (~108K nodes) would benefit from virtualization but are rare collector items on capable hardware. Images already use `loading="lazy"` via Next.js Image.

---

### C6. `get_sets_with_minifigs()` returns wrong data

**`supabase/migrations/20251231184836_fix_linter_security_issues.sql:108`**

The function declares `RETURNS TABLE(set_num text)` but the body selects `inventory_id` (an integer FK) aliased as `set_num`. It returns integer IDs like `"12345"` instead of set numbers like `"60001-1"`.

**Fix:**

```sql
SELECT DISTINCT ri.set_num
FROM public.rb_inventory_minifigs rim
JOIN public.rb_inventories ri ON ri.id = rim.inventory_id
WHERE ri.set_num IS NOT NULL AND ri.set_num NOT LIKE 'fig-%'
ORDER BY ri.set_num;
```

---

### C7. Three pricing tables have RLS enabled but zero policies

**`supabase/migrations/20260218035317_create_pricing_tables.sql`**

`bl_price_cache`, `bl_price_observations`, and `bp_derived_prices` each have `ENABLE ROW LEVEL SECURITY` but no policies are defined. Unlike every other internal table (which received explicit service_role policies in `fix_linter_security_issues.sql`), these tables were created after that migration.

**Fix:** Add a migration with service_role full-access policies for all three tables.

---

### ~~C8. Rate-limit key collision across 3 endpoints~~ ✅

**`app/api/identify/bl-supersets/route.ts`**, **`app/api/prices/bricklink/route.ts`**, **`app/api/prices/bricklink-set/route.ts`** — Fixed: added route-specific prefixes (`bl-supersets:`, `bl-prices:`, `bl-set-price:`) to both `ip:` and `user:` rate-limit keys.

---

### ~~C9. `rbFetchAbsolute` records failures before retry → premature circuit breaker~~ ✅

**`app/lib/rebrickable/client.ts:272-274`** — Fixed: removed `recordFailure()` calls inside 429/503 and 5xx retry loops. Failure is now only recorded after retries exhaust, matching `rbFetch`'s pattern.

---

## High (16 findings — fix before accepting paid users)

### Security

#### H1. Open redirect in OAuth callback

**`app/auth/callback/route.ts:50`**

The `next` query parameter is used in a redirect without validation. `//evil.com` is a protocol-relative URL that browsers follow as an absolute redirect.

**Fix:**

```typescript
const rawNext = searchParams.get('next') ?? '/';
const next =
  rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
```

#### H2. CSRF bypass when Origin header is missing

**`app/lib/middleware/csrf.ts:92-103`**

When Origin is missing, the code accepts the CSRF cookie alone without requiring the `x-csrf-token` header. Browsers send cookies automatically, so a cross-site request without an Origin header bypasses CSRF protection.

**Fix:** For `originStatus === 'missing'`, require both cookie and `x-csrf-token` header present and matching.

#### ~~H3. Unauthenticated catalog writes (2 endpoints)~~ ✅

**`app/api/sets/[setNumber]/refresh-image/route.ts`** and **`app/api/parts/bricklink/validate/route.ts`** — Fixed: added `getUser()` auth guard to both endpoints. Also fixed the validate route's rate-limit key prefix (`ip:bl-validate:` → `bl-validate:ip:` for consistency).

#### ~~H4. IP spoofing bypasses rate limiting~~ ✅

**`lib/rateLimit.ts:94-108`** — Fixed: `getClientIp` now checks platform-verified headers first (`x-nf-client-connection-ip` for Netlify, `x-real-ip` for Vercel) before falling back to the spoofable `x-forwarded-for`.

#### H5. `NEXT_PUBLIC_BETA_ALL_ACCESS` leaks entitlement strategy

**`.env.production:3`**

`NEXT_PUBLIC_` variables are embedded in the client JS bundle. While the check is server-only, the beta bypass strategy is visible to anyone inspecting the bundle.

**Fix:** Remove `NEXT_PUBLIC_BETA_ALL_ACCESS`. Use only `BETA_ALL_ACCESS` (no `NEXT_PUBLIC_` prefix).

### Data Integrity

#### H6. Inventory subpart quantity double-counting

**`app/lib/services/inventory.ts:184-213`**

When a subpart from `rb_minifig_parts` matches an existing catalog row, the code adds the minifig-based quantity unconditionally. Parts appearing both directly in a set and as minifig subparts show inflated `quantityRequired`. The live fallback path in `rebrickable/inventory.ts:143-144` correctly avoids this.

**Fix:** Track whether a canonical key originated from a direct catalog part and skip the quantity increment, only adding the `parentRelations` link.

#### H7. Stripe duplicate customer creation (TOCTOU)

**`app/lib/services/billing.ts:84-114`**

Two concurrent checkout initiations can both see no existing record, both create a Stripe customer, and race on the upsert. The losing Stripe customer is orphaned.

**Fix:** Use Stripe's `idempotency_key` (keyed to `user.id`) on `stripe.customers.create()`.

#### H8. `found_count` sync is non-atomic

**`app/api/sync/route.ts:218-243`**

Upserts, reads aggregate, then writes `found_count` — all outside a transaction. Concurrent syncs can write stale counts.

**Fix:** Move aggregate+update into a `SECURITY DEFINER` SQL function called via RPC.

#### H9. `identify/sets` entirely unauthenticated

**`app/api/identify/sets/route.ts`**

Has IP rate limiting but no `getUser()` check. Bypasses the quota-gated identify pipeline and burns BrickLink API quota.

**Fix:** Add `getUser()` check, or document the intentional public access with BL budget implications.

### Client State

#### H10. Dual leader election race

**`app/lib/sync/tabCoordinator.ts:120-137`**

Two tabs opened simultaneously can both become leader within the 500ms claim window, causing duplicate sync operations.

**Fix:** After 500ms, broadcast `claim_leader` a second time and wait 200ms before finalizing. Use tabId comparison for deterministic tiebreaking.

#### ~~H11. `SyncWorker.performSync` concurrent execution unguarded~~ ✅

**`app/lib/sync/SyncWorker.ts:151`** — Fixed: added `if (this.isSyncing) return;` as the very first check in `performSync`, before any `await`.

#### H12. `supabase_kept` overwrites local edits on remount

**`app/hooks/useSupabaseOwned.ts:408-416`**

When `existingDecision === 'supabase_kept'`, cloud data is re-applied to the owned store on every component mount, overwriting any local changes made since the last mount.

**Fix:** Add a timestamp check — only re-apply cloud data if `updated_at` is newer than local IndexedDB timestamps.

### Performance

#### ~~H13. O(n) re-render per keystroke in inventory~~ ✅

**`app/hooks/useInventoryViewModel.ts`**, **`app/components/set/Inventory.tsx`**, **`app/components/set/items/InventoryItem.tsx`** — Fixed: gated `ownedByKey` dependency on display filter (stable for display='all'), lifted `useAuth`/`useOptionalSearchParty` out of per-item rendering, removed `renderInventoryItem`/`renderedItems` memo layers. Owned changes no longer trigger O(n) recomputation in the default view.

#### H14. `usePinnedStore()` subscribes to entire store

**`app/components/set/InventoryProvider.tsx:347`**

No selector argument means Zustand triggers re-renders on any store change, cascading through `isPinned`/`togglePinned` callbacks.

**Fix:** Use granular selectors:

```typescript
const pinned = usePinnedStore(state => state.pinned[setNumber] ?? EMPTY_OBJ);
```

#### H15. N identical `user_lists` queries per collection page

**`app/hooks/useSetLists.ts:200-213`**

Each `SetDisplayCardWithControls` fires its own `user_lists` query. First render of a 50-card collection page fires 50 simultaneous identical queries before the TTL cache populates.

**Fix:** Hoist the `user_lists` fetch to `useUserLists` (already exists) and have `useSetLists` read from that shared result.

#### H16. `minifigs/[figNum]` missing rate limiting

**`app/api/minifigs/[figNum]/route.ts`**

No rate limit when `includePricing=true`, enabling unbounded BrickLink API calls via minifig ID enumeration.

**Fix:** Add `consumeRateLimit` with IP-based key matching other BL-calling endpoints.

---

## Medium (14 findings — fix when time permits)

| #   | Finding                                                                                | Location                                               |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| M1  | `sendBeacon` notifies other tabs of sync success before delivery is confirmed          | `app/lib/sync/SyncWorker.ts:190-197`                   |
| M2  | Webhook idempotency TOCTOU — concurrent Stripe retries can both process                | `app/api/stripe/webhook/route.ts:32-58`                |
| M3  | Group session INSERT policy doesn't verify session `is_active`                         | `20251215062137_group_session_participant_limit.sql`   |
| M4  | `bl-supersets` silently swallows BrickLink errors (empty catch)                        | `app/api/identify/bl-supersets/route.ts:47-50`         |
| M5  | `user/minifigs/sync-from-sets` has 160 lines of business logic inline in route handler | `app/api/user/minifigs/sync-from-sets/route.ts:65-230` |
| M6  | `group-sessions/quota` returns non-standard error shape (free-form vs `errorResponse`) | `app/api/group-sessions/quota/route.ts:62-66`          |
| M7  | `tryComputeDerivedPrice` fetches unbounded observation rows into memory                | `app/lib/services/priceCache.ts:311`                   |
| M8  | `catalogAccess.ts` table classification disagrees with actual RLS policies             | `app/lib/db/catalogAccess.ts:51-58`                    |
| M9  | `requestPricesForKeys` callback unstable due to `pendingKeys`/`pricesByKey` state deps | `app/hooks/useInventoryPrices.ts:255`                  |
| M10 | `computeMissingRows` not memoized — new function reference each render                 | `app/hooks/useInventory.ts:338`                        |
| M11 | `useInventoryControls` with `skipStorageHydration: true` overwrites global sort pref   | `app/hooks/useInventoryControls.ts:106-121`            |
| M12 | Joiner snapshot localStorage backup loses joiner-local keys on refresh                 | `app/hooks/useSearchPartyChannel.ts:227-253`           |
| M13 | Minifig parent `rbColorId: 0` collides with RB Black color ID                          | `app/lib/domain/partIdentity.ts:53-68`                 |
| M14 | `.or()` filter in `getRarestSubpartSets` can exceed URL limits for large minifigs      | `app/lib/catalog/minifigs.ts:683-690`                  |

---

## Low (6 findings — informational)

| #   | Finding                                                                                     | Location                                   |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| L1  | Identify cache-hit blocks deduplicated requests when quota is at 0 (despite `dedupe: true`) | `app/api/identify/route.ts:129-152`        |
| L2  | `GET /api/sync` is an unauthenticated no-op returning `{ ok: true }`                        | `app/api/sync/route.ts:274-276`            |
| L3  | `themes.ts` uses `console.error` instead of `logger`                                        | `app/lib/services/themes.ts:8`             |
| L4  | `billing_subscriptions.user_id` is nullable (should be NOT NULL)                            | `20251212030414_billing_foundation.sql:52` |
| L5  | `hydrationByUser` module cache prevents re-hydration after logout → login in same session   | `app/hooks/useHydrateUserSets.ts:29-30`    |
| L6  | Entitlement cache allows 5-min grace period after subscription cancellation                 | `app/lib/services/entitlements.ts:32-37`   |

---

## Runtime Performance Profile

Profiled against dev server (`localhost:3000`) using Playwright. Dev mode inflates absolute times but relative patterns and structural issues (DOM size, long tasks, duplicate calls) carry to production.

| Flow                            | API Time                   | DOM Nodes     | Memory | Long Tasks              | Key Issue                              |
| ------------------------------- | -------------------------- | ------------- | ------ | ----------------------- | -------------------------------------- |
| Initial load (`/sets`)          | 5.7s TTFB, 10s domComplete | ~500          | 135MB  | —                       | Dev SSR compilation; 6.4MB JS          |
| Search "6989"                   | 9.8s                       | ~200          | 130MB  | —                       | Slow catalog query                     |
| Inventory (506 parts, set 6989) | 59s                        | ~400+ loading | 142MB  | 33 tasks, 7.3s blocking | No virtualization; duplicate API calls |
| Identify (part 3001)            | 17.6s, 200KB response      | **27,951**    | 213MB  | —                       | **No virtualization**; 952 images      |

### Network Anomalies

- `/api/catalog/versions` called **4 times** with 2 aborted (race condition / duplicate TanStack Query triggers)
- `/api/themes` and `/api/catalog/versions` blocked behind inventory API (~53-58s durations, likely dev server contention)
- Image refresh calls for sets missing images: 10-23s each

### JS Bundle

- 7 JS chunks totaling **6.4MB transferred** (dev, unminified)
- 2.56MB after HMR navigation (incremental chunks)
- 3 custom fonts (CeraPro Bold/Regular/Medium, woff2)

---

## Top 5 Recommendations (highest impact)

1. ~~**Virtualize inventory and identify results** (C5, H13)~~ ✅ — Identify results paginated via infinite scroll; inventory render cascade eliminated. Full virtualization deferred (complexity vs. benefit for typical set sizes).

2. ~~**Fix BrickLink concurrency slot leak** (C1)~~ ✅ — Fixed.

3. ~~**Fix Supabase query builder color filter** (C2)~~ ✅ — Fixed.

4. ~~**Add auth to catalog-write endpoints** (H3) + **fix IP spoofing** (H4)~~ ✅ — Fixed.

5. **Guard mobile unload data persistence** (C3) — Prevents owned data loss on iOS Safari, which is likely a significant portion of the mobile user base.

---

## Confirmed Safe (no issues found)

- **Stripe webhook signature verification** — Correctly uses `stripe.webhooks.constructEvent()` with raw body
- **Stripe price ID validation** — `mapPriceToTier()` allowlist prevents arbitrary price substitution
- **Service role key protection** — `server-only` import, no `NEXT_PUBLIC_` prefix
- **BrickLink OAuth credentials** — No `NEXT_PUBLIC_` prefix, `server-only` imported
- **User data isolation** — All user-scoped queries filter by `user.id` from `getUser()`, RLS as defense-in-depth
- **XSS** — No user-supplied data in `dangerouslySetInnerHTML`; only hardcoded theme script
- **SQL injection** — `.or()` filter values come from catalog DB results, not raw user input; route params validated by regex
- **Image upload** — 5MB max, MIME type validated before processing
