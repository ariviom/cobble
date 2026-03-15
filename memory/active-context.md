# Active Context

## Current Focus

- **Pre-Launch:** Stripe configuration, entitlements E2E testing, onboarding flow, marketing page review
- **BrickLink API Compliance** — Code complete. Contact `apisupport@bricklink.com` pre-launch.
- Keep MVP flows stable. Preserve anonymous/local-only experience; signed-in users sync to Supabase.

## Pre-Launch Remaining

See `docs/BACKLOG.md` for full checklist. Key areas:

1. **Stripe config + testing** — Dashboard setup, env vars, E2E test all flows (see `docs/dev/STRIPE_GATING_LAUNCH_CHECKLIST.md`)
2. **Onboarding** — First-set experience, feature discovery, tier awareness (not built)
3. **Marketing page** — Review landing page for launch readiness
4. **Entitlements testing** — Thorough end-to-end validation of all gates and quotas

## Recently Completed (Mar 2026)

- Delta sync overhaul (server-versioned, watermark-based, refresh-on-focus, cross-tab)
- Collection parts: missing view redesign with contained set cards
- SyncIndicator replaced with error-only toast
- Collection import/export (JSON backup, BrickScan CSV/XML, Rebrickable sets import)
- Docs cleanup: archived 31 completed spec/plan files, consolidated BACKLOG.md

## Active Decisions

- MVP fully usable without auth; Supabase accounts are additive
- **Data sources**: Rebrickable catalog for entity data; BrickLink API for pricing only
- **BrickLink pricing is free for all users** (BL ToS)
- **Two tiers at launch: Free + Plus.** Pro deferred. Schema supports Pro.
- **Plus includes**: unlimited tabs, identifies, lists, Search Party, sync, part rarity

## Notes

- **Target test sets**: 1788, 6781, 6989, 40597, 21322
- **Pricing**: USD + `country_code=US` default; currency/country preference is future work
- 556 tests passing (66 test files), clean tsc
