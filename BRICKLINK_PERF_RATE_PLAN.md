# BrickLink Performance, Caching, and Rate-Limit Plan

## Scope (current iteration)

- P0 complete (2025-12-05); continue with P1–P5 and new stale/budget signals.

- P0 Inventory performance: derive once, align query cache, add aborts.
- P1 BrickLink rate limiting: IP+user windows, request caps/timeouts.
- P2 Caching for prices/mappings: TTL + in-flight dedupe, negative-cache.
- P3 Concurrency & circuit breaker: bounded pool, backoff on 429/503.
- P4 Input validation: zod on pricing/search/inventory/sync.
- P5 Observability (minimal): structured logs + counters (hit/miss/429/5xx).

## P0 Inventory performance

- Precompute invariant arrays once per `rows` (size, category, parent, color options, subcategory map).
- Single-pass owned-dependent totals: `totalRequired`, `totalMissing`, `ownedTotal`.
- Memoize keys and required arrays.
- React Query tuning: `staleTime` 5–15m, `gcTime` 30–60m to match `/api/inventory` cache headers.
- Add abort handling on client fetches; guard setState on unmount.

## P1 Rate limiting (edge + server)

- Middleware sliding windows (IP + user) for BL-touching routes: `/api/prices/bricklink`, `/api/prices/bricklink-set`, `/api/parts/bricklink`, Identify BL fallbacks.
- Include `Retry-After` on 429; tunable env limits.
- Per-request caps: lower `MAX_ITEMS` (~100), reject oversize bodies early; overall request timeout via AbortController.

## P2 Caching (prices & mappings)

- Price cache key: `itemType+itemNo+colorId+condition+scopeLabel` (+ key-owner partition for BYOK).
- TTL 15–60m with stale-while-revalidate; in-flight dedupe map; optional durable table for long tail.
- Mapping cache: write-through all successful RB→BL lookups; short negative cache (30–60m) for misses; respect daily mapping budgets.
- Client hints: align pricing hook `staleTime` to cache TTL when consuming cached prices.

## P3 Concurrency & circuit breaker

- Replace fixed batches with bounded concurrency pool (e.g., 5–8) for BL calls.
- Per-call timeout (15–30s) on BL client.
- Circuit breaker: after N consecutive 429/503 (e.g., 3–5), pause BL calls for cooldown (60–120s); return partial results with guidance.

## P4 Input validation

- zod schemas for: pricing routes, parts mapping, inventory, search, sync payloads.
- Enforce numeric ranges, array length limits, required fields; fail-fast with 400 + error code.

## P5 Observability (minimal)

- Structured logs (sampled in prod): route, cache hit/miss, duration, requested count, 429/5xx, retry-after, breaker state; redact PII and keys.
- Counters: cache hit/miss, BL requests, BL 429/5xx, rate-limit 429, breaker open/close.

## Addendum: pricing display states (ties to caching plan)

- User-visible states (keep simple):
  - **Real-time** (on-demand) price: badge “Real-time.” Today uses shared key; later can shift to BYOK/pro flow.
  - **Historical average** price: badge “Historical avg.” Served from periodic aggregates; store `last_updated_at` for future freshness displays but do not show it yet.
  - **Unavailable**: no historical data and on-demand blocked by rate limit/budget; message like “Price unavailable; BrickLink limit hit; retry after daily reset.”
- API/route responses should return a concise `pricing_source: 'real_time' | 'historical' | 'unavailable'` and optionally `last_updated_at` when `pricing_source='historical'`. Avoid granular stale reasons/counters; only include `next_refresh_at` when returning `unavailable` so the UI can time the retry message.
- When budgets are exhausted but historical data exists, serve the historical value and mark `pricing_source='historical'` (no queueing or extra metadata).
- Observability: lightweight counter for `pricing_unavailable` events is sufficient; no per-reason telemetry needed.

## BYOK considerations

- Calls remain server-only; partition caches by key owner; per-user quotas in addition to IP/user windows.
- Store credentials encrypted server-side; never expose to client.

## Build/test requirement

- After each stage, run `npm run build` and test suite; fix errors/warnings and rerun until passing.
