# Launch Audit Report (2026-02-17)

This report captures the current production-readiness audit for Brick Party across:

- performance bottlenecks
- security/compliance risks
- UX stability risks

The goal is to prioritize high-impact fixes before launch.

---

## Executive Assessment

The app is close to launch-ready. Core flows are implemented and generally robust:

- set search and inventory rendering
- owned-state persistence and sync
- CSV export flows
- identify and pricing flows
- Search Party collaboration path

However, launch risk is still concentrated in a few areas:

1. Search Party realtime fanout and DB load under concurrency
2. BrickLink fallback cache TTL compliance mismatch
3. expensive per-edit recomputation in large inventories
4. uneven hardening (input bounds + rate limiting) on selected endpoints

If these are addressed, the app is in a stable state for launch.

---

## Findings and Remediation Checklist

### A. High Priority (before launch)

- [ ] Reduce Search Party realtime fanout and avoid redundant roster reloads
  - Scope:
    - `app/hooks/useGroupSessionChannel.ts`
    - `app/hooks/useGroupParticipants.ts`
  - Why: heartbeat writes + wildcard change subscriptions can amplify traffic per participant and degrade responsiveness.
  - Fix direction:
    - avoid `event: '*'` reactions for heartbeat-only updates
    - limit roster refresh triggers to join/leave paths
    - reduce overlap between poll loop and realtime updates

- [ ] Align BrickLink fallback cache TTL with compliance target
  - Scope:
    - `app/lib/identify/blFallback.ts`
  - Why: current TTL is 30 days for API-derived fallback data.
  - Fix direction:
    - replace `BL_FALLBACK_TTL_MS` with compliant duration
    - ensure cleanup and fetch logic use the same TTL source of truth

### B. Medium Priority (strongly recommended before launch)

- [ ] Reduce expensive full-list recomputation on owned quantity edits
  - Scope:
    - `app/hooks/useInventoryViewModel.ts`
  - Why: multiple O(n) derivations rerun on each owned-state change and can create input lag on larger sets.
  - Fix direction:
    - split derivations into stable vs owned-dependent
    - memoize/filter incrementally where possible
    - consider deferring non-critical derived values

- [ ] Tighten request validation bounds on high-frequency mutation routes
  - Scope:
    - `app/api/group-sessions/[slug]/join/route.ts`
    - `app/api/sync/route.ts`
  - Why: currently accepts unbounded-ish string payloads in practical terms.
  - Fix direction:
    - add max lengths and stricter format validation for display names, tokens, set/part IDs
    - enforce numeric bounds where relevant

- [ ] Add protective rate limits to costly public GET endpoints
  - Scope:
    - `app/api/search/route.ts`
    - `app/api/identify/sets/route.ts`
  - Why: these are scrapeable and can trigger expensive downstream work.
  - Fix direction:
    - apply IP/user rate limits with sensible burst windows
    - include `Retry-After` behavior and metric logging

### C. Security Hardening (can be staged post-launch if needed)

- [ ] Move from relaxed CSP (`unsafe-inline`) toward nonce/hash-based policy
  - Scope:
    - `utils/supabase/middleware.ts`
    - `app/layout.tsx`
  - Why: current policy is permissive and weakens XSS containment.

- [ ] Improve persistent observability for launch operations
  - Scope:
    - `lib/metrics.ts` and deployment logging pipeline
  - Why: current metrics are structured but console-backed; difficult to trend route regressions and quota pressure without aggregation.

### D. UX Stability Polish

- [ ] Replace hard redirects with app router navigation where applicable
  - Scope:
    - `app/hooks/useSearchPartyLifecycle.ts`
    - `app/components/nav/SetTopBar.tsx`
  - Why: `window.location.href` forces hard reload and can drop local UI state.

---

## Verification Plan

- [ ] Run load simulation with multiple concurrent Search Party participants and verify:
  - stable DB query/write rate
  - no visible roster lag
  - no runaway subscription-triggered fetch loops
- [ ] Profile inventory interaction on large sets and verify no perceptible input lag.
- [ ] Re-run endpoint abuse checks (search/identify/sync) for bounded behavior.
- [ ] Validate BrickLink fallback behavior with updated TTL and no stale-result regressions.

---

## Launch Readiness Criteria

Launch can be considered stable once:

- all High Priority items are complete
- Medium Priority items that materially affect user-facing responsiveness and abuse protection are complete
- smoke tests pass for search, inventory, export, identify, pricing, and Search Party flows
