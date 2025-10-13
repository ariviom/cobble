# System Patterns

## System Architecture

- Next.js App Router (TypeScript, React Server Components where beneficial).
- Route Handlers under `app/api/*` for server-side calls to Rebrickable using env `REBRICKABLE_API`.
- Client components for table interactions, owned quantity editing, sorting, and export.
- State management:
  - TanStack Query for server data (set inventory).
  - Zustand for UI state and per-set owned quantities.
  - localStorage persistence keyed by set ID.
- Mapping layer for Rebrickable ↔ BrickLink part/color IDs used during export.

## Key Technical Decisions

- No authentication in MVP; local-only persistence.
- Server-only Rebrickable access; never expose `REBRICKABLE_API` in the client.
- Omit pricing and rarity in MVP; defer to future versions.
- Export formats supported in MVP: Rebrickable CSV, BrickLink CSV (wanted list). BrickOwl deferred.
- Wanted list naming: "{setNumber} — {setName} — mvp". Condition defaults accepted; toggle for new/used later.
- Virtualized table to handle large inventories.
- Graceful error states with retry.
- Performance target: < 3s for inventories ≤ 1000 parts.

## Design Patterns

- Adapter pattern for export generators (Rebrickable CSV, BrickLink CSV).
- Mapper/translator for ID/color code conversion (Rebrickable ↔ BrickLink).
- Cache-first data fetching with fetch cache and revalidate window for set inventories.
- Unidirectional data flow: server fetch → query cache → UI state (owned) → derived missing → export.
- UI components:
  - Tabbed filter bar (`InventoryFilterTabs`) provides filtering across All/Missing/Owned and categories, with horizontal scroll and arrow controls and enlarged touch targets.
  - Search bar uses inline clear control with large touch target and label positioned above input.

## Gaps / Opportunities
- Owned persistence store (`store/owned.ts`) incomplete; needs storage key, write, and in-memory cache.
- Export validation against Rebrickable/BrickLink importers pending.
- Category taxonomy derived from part name is heuristic; could benefit from a curated mapping for parent categories.
