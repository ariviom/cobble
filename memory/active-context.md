# Active Context

## Current Focus

Implement MVP for set search, parts inventory display, owned quantities, missing computation, and CSV exports (Rebrickable + BrickLink) with local persistence.

## Immediate Next Steps

- Scaffold Next.js app with TypeScript, Tailwind, shadcn/ui.
- Add `.env` with `REBRICKABLE_API` and server-only access.
- Implement Route Handlers for Rebrickable set search and parts inventory.
- Build set search input with autocomplete and validation.
- Implement inventory table with virtualization, sorting, images.
- Implement owned quantity per-row and bulk actions; derive missing.
- Implement export generators:
  - Rebrickable CSV.
  - BrickLink CSV wanted list with name "{setNumber} — {setName} — mvp".
- Persist owned data per set in `localStorage`.
- Add loading spinner and error states.

## Notes

Target test sets:
- 1788 — Pirate Treasure Chest
- 6781 — SP-Striker
- 6989 — Mega Core Magnetizer
- 40597 — Scary Pirate Island
- 21322 — Pirates of Barracuda Bay

## Recent Changes

Initial memory docs drafted and agreed MVP scope captured.

## Next Steps

Build the MVP features listed above, then validate exports against sample accounts or format validators.

## Active Decisions and Considerations

- No auth, no external account linking.
- Pricing and rarity deferred.
- BrickOwl export deferred; focus on Rebrickable + BrickLink CSV.
- Server-only Rebrickable access; no client key exposure; no scraping.
- Accessibility: basic keyboard navigation acceptable for MVP.
