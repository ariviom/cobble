# Active Context

## Current Focus

Prepare the app for simple user accounts and Supabase-backed persistence while keeping the existing MVP solid: search, inventory display, owned quantities, missing computation, CSV exports (Rebrickable + BrickLink), and optional BrickLink pricing.

## Immediate Next Steps

- Add simple auth and user accounts (Supabase) while preserving local-only behavior for unauthenticated users.
- Wire Supabase-backed persistence for user sets/status and, optionally, server-side sync of owned quantities and pinned pieces.
- Tighten pricing UX around the new manual "Get prices" action (set-level BrickLink lookup) and validate pricing totals on a handful of test sets.
- Add tests for CSV export generators (Rebrickable + BrickLink) and for Rebrickable client retry/backoff behavior.

## Notes

Target test sets:

- 1788 — Pirate Treasure Chest
- 6781 — SP-Striker
- 6989 — Mega Core Magnetizer
- 40597 — Scary Pirate Island
- 21322 — Pirates of Barracuda Bay

- BrickLink pricing requests use USD + `country_code=US` by default; plan to expose currency/country as a future user preference setting.

## Recent Changes

- Next.js scaffold in place with global layout and React Query provider.
- Rebrickable proxy Route Handlers implemented for search and inventory.
- Set search UI with debounce and link to set pages.
- Virtualized inventory table with images, owned input, bulk actions, and total missing.
- Inventory controls refactored into an `useInventoryViewModel` hook that centralizes filtering, sorting, grouping, and derived metadata, keeping `InventoryTable` mostly presentational.
- Inventory table now sorts by name, color, size, category, and supports grouping, with filtering by missing/owned, parent categories, and colors.
- Search bar: moved label above, added inline clear “x” with enlarged touch target.
- Owned persistence implemented in `app/store/owned.ts` with versioned storage key, cache-first reads, and debounced writes using `requestIdleCallback` when available.
- Export modal implemented with Rebrickable CSV and BrickLink wanted list CSV generation.
- Optional BrickLink pricing implemented via `/api/prices/bricklink` and `useInventoryPrices`, now triggered per-row from inventory items via "Get price" actions, plus a separate set-level estimate via `/api/prices/bricklink-set` in the set top bar.

## Next Steps

- Validate CSV exports against Rebrickable and BrickLink import validators and adjust mappings as needed.
- Implement and harden Supabase auth and persistence (initially for user sets/status, with a migration path for owned/pinned data).
- Iterate on pricing performance and UX if test sets show noticeable lag or confusing totals.

## Active Decisions and Considerations

- No auth, no external account linking in the current deployed MVP; Supabase-backed simple accounts are the next major feature.
- Pricing and rarity: only a coarse BrickLink-based price estimate is in scope; advanced analytics and rarity metrics remain out of scope.
- BrickOwl export deferred; focus on Rebrickable + BrickLink CSV.
- Server-only Rebrickable access; no client key exposure; no scraping.
- Accessibility: basic keyboard navigation acceptable for MVP; dropdowns/sheets still use custom keyboard handling and should be audited post-auth.
