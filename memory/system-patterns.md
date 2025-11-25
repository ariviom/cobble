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

- No authentication in MVP; local-only persistence. Simple user accounts via Supabase are planned next.
- Server-only Rebrickable access; never expose `REBRICKABLE_API` in the client.
- Pricing: optional BrickLink-based price lookup is supported via a manual per-set "Get prices" action; advanced analytics/rarity remain out of scope.
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
- Client-side persistence uses cache-first reads with debounced write-through to localStorage; writes prefer `requestIdleCallback` when available.
- Local-first, optimistic UX: Zustand/localStorage is the immediate source of truth; Supabase writes are fire-and-forget and reads hydrate once per mount to avoid extra round-trips.
- Database calls happen only on explicit user actions (e.g., opening a collection) and results are cached in component state to keep the UI responsive.
- UI components:
  - Tabbed filter bar (`InventoryFilterTabs`) provides filtering across All/Missing/Owned and categories, with horizontal scroll and arrow controls and enlarged touch targets.
  - Search bar uses inline clear control with large touch target and label positioned above input.
  - Set top bar composes set metadata, owned/missing summary, user-set status chips, and price actions (manual "Get prices" trigger plus aggregate price display).
- Inventory view-model hook (`useInventoryViewModel`) centralizes sorting/filtering/grouping and derived metadata, keeping `InventoryTable` mostly presentational.
- Error domain helpers (`AppError`, `throwAppErrorFromResponse`) normalize HTTP failure handling across client fetchers.

## Gaps / Opportunities
- Export validation against Rebrickable/BrickLink importers pending.
- Category taxonomy derived from part name is heuristic; could benefit from a curated mapping for parent categories.
- Supabase integration for auth and persistence still to be designed and wired into existing stores without overcomplicating the data layer.

## Performance Optimization Opportunities

### Future Optimization: useInventory Hook Calculations
The `useInventory` hook in `app/hooks/useInventory.ts` recalculates `totalMissing` on every owned store change, which can be expensive for large inventories (500+ parts).

**Current implementation:**
- `totalMissing` uses `useMemo` but depends on `ownedStore`, which changes frequently
- Each calculation iterates through all rows and calls `ownedStore.getOwned()` for each

**Potential optimizations:**
1. **Derived state in Zustand store**: Calculate missing totals in the Zustand store itself, only recomputing when relevant data changes
2. **More granular memoization**: Split calculations by category or use indexed lookups
3. **Incremental updates**: Track deltas instead of recalculating from scratch
4. **Virtualized calculations**: Only calculate visible rows initially, compute rest on-demand

**Impact**: Large sets (>1000 parts) may experience UI lag when rapidly updating owned quantities.

**When to address**: When users report performance issues with large inventories or when inventory sizes consistently exceed 500-1000 parts.
