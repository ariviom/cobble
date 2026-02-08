# Project Memory

## Key Architecture Insights

### Inventory Data Flow
- TanStack Query (`['inventory', setNumber]`) is the single source of truth for inventory data
- `useInventory` → `useInventoryViewModel` → `InventoryProvider` (5 focused contexts) → consumers
- Local-first caching: checks IndexedDB before network fetch
- Each set tab has its own `InventoryProvider` with isolated context (keyed by `tab.id`)

### Inventory Context Split (0b19ce9)
- **Single provider, 5 contexts**: `InventoryProvider` still orchestrates all hooks but distributes via 5 `useMemo` + nested providers
- `useInventoryData()` — core data, owned state, migration, bulk actions, group session (27 fields)
- `useInventoryControls()` — sort/filter/view/group + derived options (20 fields)
- `useInventoryPricing()` — prices, pending keys, requester (3 fields)
- `useInventoryPinned()` — isPinned, togglePinned, getPinnedCount (3 fields)
- `useInventoryUI()` — export modal, enrichment toast, export helpers (7 fields)
- **Old `useInventoryContext()` is deleted** — all consumers use focused hooks
- `InventoryControls.tsx` aliases `useInventoryControls as useControls` to avoid component name collision

### Minifig Enrichment
- Server-side: `inventory.ts` loads catalog parts + BL minifig subparts, deduplicates
- Client-side: `useMinifigEnrichment.ts` fills in missing images/subparts
- **Critical**: Rebrickable and BrickLink use different color ID systems (e.g., Black = RB 0, BL 11)
- Color mapping available via `getColors()` from `@/app/lib/rebrickable` (cached 1hr)

### Tab System
- Tabs are all mounted simultaneously, hidden/shown via `display: none/flex`
- Each `SetTabContainer` has its own hooks/state, isolated by React `key={tab.id}`
- `isHydrating` is always false when `SetTabContainer` renders (early return in SetsPage)

## Bug Patterns to Watch
- Dual data sources with separate loading states → mismatch bugs
- RB↔BL ID system mismatches (parts AND colors use different numbering)
- `existingRowsByKey` dedup maps must use consistent color ID systems

## Architectural Rewrite Plans
- Plans tracked in `memory/working/00-summary.md` (7 plans, 01 complete)
- **Plan 01 DONE**: Split InventoryProvider (0b19ce9)
- Recommended next: 07 (Normalize Colors) → 02 (Part Identity) → 03 (Server-Driven Inventory)
- Independent: 05 (SyncEngine — fixes sync bug), 04 (Tab Unmount), 06 (Identify Pipeline)

# Environment
- 242/243 tests passing (1 pre-existing failure in `useCompletionStats.test.ts`)
- Clean `tsc --noEmit`
