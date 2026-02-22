# Active Context

## Current Focus

- **Stripe UI/UX Enforcement** — Wire up billing UI (Account page, upgrade CTAs, inline upsells) and feature gating (SSR preload, API guards, usage counters). **Two tiers at launch: Free + Plus only** (Pro deferred).
- **BrickLink API Compliance** — Code changes complete. Contact `apisupport@bricklink.com` pre-launch to confirm commercial use case.
- **Derived Pricing System** — Plan at `docs/dev/DERIVED_PRICING_PLAN.md`. Post-launch priority.
- Keep MVP flows (search, inventory, owned vs missing, CSV exports, pricing) stable.
- Preserve anonymous/local-only experience while signed-in users sync to Supabase.

## Recently Completed (Feb 2026)

- **Search Party**: color slots, progress strip, host-only join UI, session resume persistence (heartbeat flush, joiner localStorage cache, host beforeunload guard), fixed N^2 fanout + found pieces reset + host refresh ending session
- **UI Polish**: redesign cycle (soft shadows → reverted 3D buttons), set cards overhaul, SignInPrompt modal, collection hero, badge sizing, card color strips
- **Inventory**: group-by headers with rarity-aware sorting, performance optimizations (parallel queries, reduced recomputation), All/Missing/Owned filter repositioned, grid-small default with localStorage persistence
- **Set Detail Modal**: pricing, details, external links from inventory views; opens on card click from search/identify routes
- **Inventory Item Modal**: full-width part image, BrickLink image fallback
- **Owned data loss fix**: microtask batching replaces 500ms debounce
- **BL API**: daily quota tracking with graceful degradation, `hit_count` on price cache
- **Sentry** error tracking integrated
- **Identify**: minifig heuristic catalog verification, sets-via-subparts, rarest subpart "May also appear in" section
- **Minifig matching**: self-sufficient BL crawl + seed, autoselect duplicate fix, color filter includes subparts
- **Bug fixes**: spare parts CSV parsing, /collection 404, minifig pricing, kebab menu, missing/owned filter subpart completion

See `docs/BACKLOG.md` for full backlog.

## Notes

- **Target test sets**: 1788, 6781, 6989, 40597, 21322
- **Pricing**: USD + `country_code=US` default; currency/country preference is future work.
- 362 tests passing, clean tsc.

## Active Decisions

- MVP remains fully usable without auth; Supabase accounts are additive.
- **Data sources**: Rebrickable catalog for all entity data; BrickLink API for pricing and identify fallback only.
- **BrickLink pricing is free for all users** — BL ToS prohibits gating their data behind a paywall.
- **Two tiers at launch: Free + Plus.** Pro deferred. Schema already supports Pro.
- **Plus tier includes**: unlimited tabs, identifies, exports, lists, Search Party, sync, part rarity.
- **ID mapping tables are ToS-compliant** — sourced from bricklinkable community data and Rebrickable.
- Out of scope: BrickOwl export, advanced rarity analytics.
