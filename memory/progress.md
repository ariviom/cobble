# Progress

## What Works

- MVP scope defined; memory docs drafted with requirements and constraints.

## What's Left to Build

- Next.js app scaffold with styling and component library.
- Server Route Handlers for Rebrickable set search and parts inventory.
- Set search UI with autocomplete and validation.
- Inventory table with virtualization, images, sorting.
- Owned quantities per-row, bulk actions, derived missing quantities.
- Export generators: Rebrickable CSV and BrickLink CSV (wanted list) named "{setNumber} — {setName} — mvp".
- localStorage persistence keyed by set.
- Loading spinner and error states.

## Current Status

Planning complete; ready to implement MVP locally using `.env` with `REBRICKABLE_API`.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets.
- ID/color mapping mismatches between Rebrickable and BrickLink affecting CSV exports.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.