# Progress

## Status

Core feature-complete: search, inventory, owned tracking, CSV exports, pricing, identify, Search Party, delta sync, collection import/export, billing UI, feature gating.

Auth + Supabase sync wired up. Sentry error tracking. BL API quota tracking with graceful degradation. RB catalog is unified source of truth.

**Pre-launch remaining:** Stripe dashboard config + E2E testing, onboarding flow, marketing page review, BL API commercial use contact.

653 tests passing (82 files), clean tsc.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets
- Large inventories (>1000 parts) need careful virtualization
- BrickLink API rate limits (5K/day) — daily tracking with degradation
- No persistent metrics — Sentry + ephemeral logs only
- CSV specs must exactly match marketplace requirements to import successfully
- Stripe price IDs may differ between test/live mode — verify before launch

## Recent Hardening

- Stripe webhook event-record failures now return retryable failures instead of silently ACKing
- Promo redemption uses Stripe idempotency keys
- Account deletion blocks on active subscription cancel failures
- Public self-heal endpoints no longer write directly to shared catalog tables
- Identify quota success path uses atomic usage consumption after pipeline success
- Vitest excludes Playwright E2E specs so default unit test command passes

## Backlog

See `docs/BACKLOG.md` for the full consolidated task list.
