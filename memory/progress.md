# Progress

## Status

Core MVP feature-complete: search, inventory, owned tracking, CSV exports, pricing, identify, Search Party.
Auth + Supabase sync wired up. Sentry error tracking. BL API quota tracking with graceful degradation.
RB catalog is unified source of truth. BL API for pricing + identify fallback only.
Main remaining: Stripe UI/UX (Free + Plus tiers), pre-launch BL API contact.
362 tests passing, clean tsc.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets
- Large inventories (>1000 parts) need careful virtualization
- BrickLink API rate limits (5K/day) — daily tracking with degradation
- No persistent metrics — Sentry + ephemeral logs only
- CSV specs must exactly match marketplace requirements to import successfully

## Backlog

See `docs/BACKLOG.md` for the full consolidated task list.
