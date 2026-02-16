## Billing Rollout Plan (Free → Plus → Pro)

### Tiers & Capabilities
- **Free**
  - Identify: 5 requests per calendar day (per user).
  - Search Party: joins allowed; hosting limited to 2 sessions per calendar month.
  - Custom lists: max 1 list; no uploads (lists are user groupings only).
  - Pricing: free for all users (BL ToS — no paywall on BL data).
  - Sync: local-only; cloud sync blocked. On upgrade, sync local → cloud.
  - BrickLink key: not allowed.
  - MOC uploads: not allowed (Pro only).
- **Plus** ($6–$8/mo)
  - Unlimited Identify.
  - Unlimited custom lists (uploads allowed when built).
  - Unlimited Search Party (host/join).
  - Pricing: free for all users (same as Free tier — BL ToS).
  - Sync across devices (cloud enabled).
  - Advanced Search Party tools (bounties/scoring) when built.
- **Pro** ($15–$20/mo, real-time/ops tier)
  - Everything in Plus.
  - Bring-your-own BrickLink API key → real-time pricing, wanted list sync, active carts.
  - Custom MOC import/support (part breakdown, match-to-inventory, build-steps analysis).
  - Bulk tools (inventory merging, multi-set planning, multi-list diffing).
  - Pricing: on-demand/real-time via BYO key.

### Feature Flags & Seeds (explicit rows)
- Upsert into `feature_flags` (min_tier, rollout_pct=100):
  - Plus/Pro (enabled): `identify.unlimited` (plus), `lists.unlimited` (plus), `search_party.unlimited` (plus), `sync.cloud` (plus).
  - Plus/Pro (disabled until built): `lists.upload` (plus), `search_party.advanced` (plus).
  - Pro-only (disabled): `bulk.tools` (pro), `pricing.realtime` (pro).
  - Deleted by migration `20260216053312`: `pricing.full_cached`, `bricklink.byo_key`, `mocs.custom` (stale/deferred).
- Overrides table stays for allowlists/betas.

### Enforcement & Quotas
- **Resolver module**: `app/lib/services/entitlements.ts` (server-only)
  - `getEntitlements(userId, { supabase?, betaOverride? })` → `{ tier, features, featureFlagsByKey }`.
  - `hasFeature(featureKey)` / `assertFeature(featureKey, opts?)`.
  - Request-scope caching (attach to request context/async local storage).
- **Entitlements API**: `GET /api/entitlements`
  - Auth required; returns `{ tier, features }` for user; anon → `{ tier: 'free', features: [] }`.
- **Quotas (usage_counters table)**:
  - Schema: `user_id uuid`, `feature_key text`, `window_kind text check in ('daily','monthly')`, `window_start date`, `count int default 0`, `created_at timestamptz default now()`.
  - PK: `(user_id, feature_key, window_kind, window_start)`. Index on `(feature_key, window_kind, window_start)`.
  - RLS: service_role all (internal use).
  - Identify: key `identify:daily`, window_kind `daily`, window_start = calendar day UTC; free limit 5; plus/pro unlimited.
  - Search Party host: key `search_party_host:monthly`, window_kind `monthly`, window_start = first of month UTC; free limit 2; plus/pro unlimited. Joins are unmetered.
- **Routes to guard (initial)**:
  - Identify: `/api/identify` → assert quota for free.
  - Search Party host/create: `/api/group-sessions` (or host create route) → quota; join route unmetered.
  - Lists: move create/update to server handler/RPC; enforce free max=1 list; plus/pro unlimited. Uploads/MOC import blocked for free.
  - Pricing: `/api/prices/bricklink`, `/api/prices/bricklink-set`:
    - All tiers → on-demand BL API calls with ≤6hr server cache. No entitlement checks (BL ToS — pricing free for all users).
  - Sync: `/api/sync` + sync worker → no-op for free with message; plus/pro allowed.
- **Errors/UX**: normalized `feature_unavailable` with reasons `quota_exceeded | upgrade_required | coming_soon`; include `limit`, `remaining`, `reset_at` for quotas; prefer upsell over 403 for pricing.

### Pricing (resolved)
- **All tiers**: on-demand BL API calls with ≤6hr server cache. BrickLink API ToS prohibits gating their free-to-members data behind a paywall. Entitlement checks removed from pricing routes (migration `20260216053312` + route handler changes).
- **Future (Pro)**: BYO BrickLink API key for higher rate limits (pending BL approval). No tier-based pricing split needed.

### Stripe/Billing Integration Focus
- Keep price allowlist (monthly Plus/Pro) and webhook upserts wired to `billing_subscriptions`.
- Entitlements should consume `billing_subscriptions` + flags/overrides to drive gating once beta ends.
- Checkout/portal stay hidden during beta; ready to enable when `BETA_ALL_ACCESS` flips off and live keys are set.

### Not Built Yet (track)
- BYO BrickLink key + real-time pricing/wanted list sync.
- Custom MOC import/breakdown.
- Bulk tools (inventory merge, multi-set planning, multi-list diff).
- Advanced Search Party tools (bounties/scoring).
- Pricing pipeline split (cached vs real-time) and UI/UX for pricing upsell.

### Implementation Checklist (handoff-ready)
1) Migration: add `usage_counters` table (schema above) with RLS + service_role policy.
2) Migration: upsert feature_flags rows listed above.
3) Entitlements module: `app/lib/services/entitlements.ts` with caching + `hasFeature/assertFeature`.
4) API: `GET /api/entitlements` (auth), returns tier/features; anon => free.
5) Quota helpers: functions to increment/check `usage_counters` by window_kind and return remaining/reset.
6) Guards:
   - Identify route: apply quota for free.
   - Search Party host route: apply monthly host quota; join unmetered.
   - Lists: refactor create/update via server/RPC; enforce free max=1.
   - Pricing routes: free upsell payload; plus cached; pro real-time (stub until BYO key exists).
   - Sync: free no-op; plus/pro proceed.
7) Errors/logging: standard error shape + logging on denied checks.
8) Tests: resolver; flags/overrides; identify daily quota; host monthly quota; list cap; pricing gating; sync gating; entitlements API.
9) Rollout: disable `BETA_ALL_ACCESS`, set live Stripe envs, enable CTAs when ready.

