# Active Context

## Current Focus

Implement MVP for set search, parts inventory display, owned quantities, missing computation, and CSV exports (Rebrickable + BrickLink) with local persistence.

## Immediate Next Steps

- Fix search JSON parsing in `components/search/set-search.tsx` (parse `res.json()` before returning `data.results`).
- Complete owned persistence in `store/owned.ts`: implement `storageKey` and `write`, and add a simple in-memory cache per set to avoid repeated `localStorage` reads.
- Add sorting controls to the inventory table for name, color, size. (Required/Owned/Missing replaced by filter tabs)
- Implement export generators:
  - Rebrickable CSV.
  - BrickLink CSV wanted list named "{setNumber} — {setName} — mvp" with ID/color mapping.
- Persist last viewed set in `localStorage` and restore on home page.
- Add error states and retries for search/inventory; keep the basic loading UI.

## Notes

Target test sets:

- 1788 — Pirate Treasure Chest
- 6781 — SP-Striker
- 6989 — Mega Core Magnetizer
- 40597 — Scary Pirate Island
- 21322 — Pirates of Barracuda Bay

## Recent Changes

- Next.js scaffold in place with global layout and React Query provider.
- Rebrickable proxy Route Handlers implemented for search and inventory.
- Set search UI with debounce and link to set pages.
- Virtualized inventory table with images, owned input, bulk actions, and total missing.
- Replaced sort keys for required/owned/missing and the group-by-category toggle with a new tabbed filter bar (All, Missing, Owned, plus per-category tabs) with horizontal scroll and arrow controls.
- Search bar: moved label above, added inline clear “x” with enlarged touch target.

## Next Steps

Finish owned persistence and search parsing fix, then validate CSV exports against Rebrickable and BrickLink import validators. Iterate on tab filtering UX and performance if needed.

## Active Decisions and Considerations

- No auth, no external account linking.
- Pricing and rarity deferred.
- BrickOwl export deferred; focus on Rebrickable + BrickLink CSV.
- Server-only Rebrickable access; no client key exposure; no scraping.
- Accessibility: basic keyboard navigation acceptable for MVP.
