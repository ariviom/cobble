# Improvement Plan v2 (Priority-Ordered)

## 1) Critical Security & Data Integrity

- **Lock down BrickLink cache tables** (`supabase/migrations/20251209151207_add_bl_part_cache.sql`, `app/lib/db/catalogAccess.ts`)
  - Enable RLS and service-role-only policies for `bl_parts`/`bl_part_sets`; register tables as service-role in `catalogAccess`.
  - Impact: closes new exposure and keeps DB linter green.
- **Supabase session middleware** (`utils/supabase/middleware.ts`)
  - Replace pass-through with `@supabase/ssr` cookie refresh (Node runtime) and scoped matcher.
  - Impact: stable SSR auth; fewer silent logouts.
- **Unified rate limiting** (`app/api/identify`, `app/api/prices/bricklink*`, `app/api/parts/bricklink`, `lib/rateLimit.ts`)
  - Use RPC-based limits for IP/user; bounded LRU+TTL fallback; consistent `Retry-After`.
  - Impact: predictable throttling across instances.
- **CSRF/origin hardening** (`app/lib/middleware/csrf.ts`)
  - Safe referer parsing, env-driven allowlist (prod/preview/local), optional double-submit token for POST.
  - Impact: stronger cross-site defense, fewer false 403s.
- **Production logging/metrics** (`lib/metrics.ts`, `next.config.ts`)
  - Ensure telemetry uses preserved log levels or dedicated transport; avoid removal by compiler.
  - Impact: restores observability in prod.

## 2) High Stability & Data Loss Prevention

- **Reliable sync flush** (`app/components/providers/data-provider.tsx`, `app/store/owned.ts`)
  - Flush pending ops on visibilitychange/unload via `sendBeacon` with payload; reduce debounce when hidden.
  - Impact: prevents last-edit loss.
- **Owned hydration robustness** (`app/hooks/useSupabaseOwned.ts`, `app/lib/localDb/*`)
  - Add `AbortController`, paging/limits, hash-based short-circuit; fewer blocked renders on large sets.
  - Impact: faster loads, safer UX.
- **Bounded caches** (`app/lib/services/inventory.ts` spareCache, rate-limit fallback maps, owned-store caches)
  - Add LRU+TTL and cleanup; cap map sizes.
  - Impact: stable memory under load.

## 3) Architecture & Maintainability

- **InventoryTable decomposition** (`app/components/set/InventoryTable.tsx` + related hooks)
  - Split into container/presentational; extract pricing/group-sync/owned handlers; memoize leaf rows.
  - Impact: smaller rerender surface, easier testing.
- **Owned-sync abstraction** (`useSupabaseOwned`, `inventory-utils`)
  - Centralize key parsing/enqueue/migration prompts; reuse across host/participant flows.
  - Impact: less duplication, clearer invariants.
- **Timing/config constants** (`app/config/timing.ts`)
  - Centralize debounce/interval/rate window values; eliminate magic numbers.
  - Impact: consistent tuning, simpler audits.

## 4) Performance & UX

- **Identify pipeline caching** (`app/lib/services/identify`, `app/lib/brickognize.ts`)
  - Small LRU for part/color → enrichment; cap payload logging; budget-aware backpressure.
  - Impact: lower latency, reduced external calls.
- **Spare-part fetch efficiency** (`app/lib/services/inventory.ts`)
  - Bound spareCache; consider storing TTL metadata to skip repeated fetches per set.
  - Impact: fewer redundant Rebrickable calls.

## 5) Testing & Verification

- **Integration/security tests** (`app/api/*`, Supabase test schema)
  - Routes: inventory, search, prices, identify, sync; assert validation, rate limits, error envelopes.
  - RLS tests for new tables (anon/auth blocked).
- **Persistence/e2e** (Dexie + sync queue)
  - Offline edits → background sync → server state; tab-close data retention.
- **Performance regression checks**
  - Inventory virtualization scroll perf; identify budget adherence.

## 6) Code Hygiene

- **Remove dead/commented code** (`app/layout.tsx` SVG block, similar)
- **Logging consistency**
  - Replace stray console warnings with structured logger gated by env.
- **Docs update**
  - Note RLS classifications and rate-limit policy in `IMPROVEMENT_PLAN.md`/README.
