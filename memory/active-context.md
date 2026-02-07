# Active Context

## Current Focus

- **Stripe UI/UX Enforcement** - Wire up billing UI (Account page, upgrade CTAs, inline upsells) and feature gating (SSR preload, API guards, usage counters).
- Keep the MVP flows (search, inventory, owned vs missing, CSV exports, optional pricing) stable.
- Preserve anonymous/local-only experience while signed-in users sync to Supabase.

## Recently Completed (February 2026)

- **Cross-Device Sync: Recently Viewed & Continue Building**:
  - New `user_recent_sets` table with RLS for cross-device recently viewed sync
  - Added `found_count` column to `user_sets` with backfill migration
  - New `/api/recent-sets` route (GET: pull with metadata join, POST: fire-and-forget push)
  - `useSyncRecentSet` hook fires POST to cloud on set view (authenticated users only)
  - `useRecentSets` hook merges local (localStorage) + cloud (Supabase) recent sets by newest `lastViewedAt`
  - Wired sync into 3 call sites: `SetTabContainer`, `SetPageRedirector`, `SetPageClient`
  - `/api/sync` now computes and updates `found_count` on affected `user_sets` after processing parts
  - `/api/user-sets` returns `foundCount` in response; store and hydration updated
  - `useCompletionStats` simplified: reads `foundCount` from user sets Zustand store instead of expensive paginated `user_set_parts` scan
  - Removed `fetchCloudOwnedBySet` and `fetchCloudSetMeta` functions (no longer needed)
  - All 243 tests passing, clean type check, no lint errors

## Recently Completed (January 2026)

- **Set Ownership Overhaul** (Group 1 from consolidation plan):
  - Migrated from mutually exclusive `status` enum ('owned' | 'want') to boolean `owned` column
  - Wishlist is now tracked as a system list in `user_lists` rather than a status
  - Sets can now be BOTH owned AND on wishlist simultaneously
  - Created migration `20260125035830_set_ownership_overhaul.sql`
  - Updated store (`user-sets.ts`): `setStatus()` → `setOwned()`, simplified `SetStatus` type
  - Updated hooks: `useSetStatus`, `useHydrateUserSets`, `useSetOwnershipState`
  - Updated UI: `SetOwnershipAndCollectionsRow` now has single "Owned" toggle + "List" button
  - Updated API routes, public views, and collection pages
  - All 221 tests passing

All major December 2025 initiatives have been completed:

- **BrickLink-Only Minifig Architecture** - Removed unreliable RB↔BL minifig mapping heuristics:
  - BrickLink is now the exclusive source of truth for minifig IDs (no RB→BL mapping)
  - Dropped `bricklink_minifig_mappings` table and `rb_fig_id` column from `bl_set_minifigs`
  - `minifigSync.ts` is now the single orchestrator for all sync operations (set-minifigs and minifig-parts)
  - Centralized in-flight tracking prevents duplicate BrickLink API calls
  - `inventory.ts` filters OUT RB minifig rows and replaces entirely with BL data
  - Batch-fetches all minifig subparts in one query for performance
  - Deleted scripts: `build-minifig-mappings-from-all-sets.ts`, `build-minifig-mappings-from-user-sets.ts`
  - Removed unused `'pending'` from `SyncStatus` type
  - Added `app/lib/bricklink/colors.ts` for BrickLink color name lookup
- **Hybrid Scroll Restoration** - Replaced index-based scroll restoration with a platform-specific hybrid approach:
  - **Desktop**: Persistent scroll containers (browser preserves scrollTop), only children unmount/remount. Zero restoration code needed.
  - **Mobile**: Simple `window.scrollY` save/restore in memory map.
  - Removed ~100 lines of scroll restoration code (scrollRegistry, scrollIndex tracking, double rAF hacks, grace periods).
  - New files: `DesktopTabLayout.tsx`, `MobileTabLayout.tsx`, `DesktopSetTabContent.tsx`, `MobileSetTabContent.tsx`, `useIsDesktop.ts`
  - Deleted: `app/lib/scrollRegistry.ts`
  - Store schema: Removed `scrollIndex` and `scrollItemKey` from `TabFilterState`.
- **SPA Tab Architecture** - Platform-aware rendering via `useIsDesktop()` hook. Desktop uses persistent containers with conditional children; mobile uses key-based remount. URL syncs via History API (`/sets?active=setNumber`).
- **BrickLink Minifig Migration** - BrickLink is now the exclusive source of truth for minifig IDs, metadata, and component parts. Self-healing system in place.
- **Minifig Cascade Fix** - Toggling parent minifigs correctly cascades to subparts.
- **Shared Minifig Parts Fix** - Multiple minifigs sharing subparts correctly aggregate quantities.
- **Supabase SSR Auth** - Fully wired for layout/theme, account page, user sets, pricing, and group sessions.
- **Legal/Compliance** - Terms and Privacy updated for subscriptions (commented sections awaiting Stripe rollout).

See `docs/BACKLOG.md` for full backlog of remaining work.

## BrickLink Minifig Architecture

BrickLink is the exclusive source of truth for minifigure data. See `docs/dev/BRICKLINK_MINIFIG_MIGRATION_COMPLETE.md` for full architecture details.

### Key Files
- `app/lib/bricklink/minifigs.ts` - BL-only data access (`getSetMinifigsBl()`, `getSetsForMinifigBl()`)
- `app/lib/catalog/sets.ts` - `getSetInventoryLocal()` with minifig part deduplication
- `app/lib/services/inventory.ts` - Inventory with BL minifig enrichment

### Self-Healing
- **Set → Minifigs**: Checks `bl_sets.minifig_sync_status`, triggers BL API sync if needed
- **Minifig → Sets**: Queries `bl_set_minifigs`, calls `blGetMinifigSupersets()` if empty

## Notes

- **Target test sets**: 1788, 6781, 6989, 40597, 21322
- **Pricing**: USD + `country_code=US` default; currency/country preference is future work.
- **Identify flow**: See `memory/system-patterns.md` for Identify pipeline documentation.

## Active Decisions

- MVP remains fully usable without auth; Supabase accounts are additive.
- **Data sources**: Rebrickable for parts/sets; BrickLink for minifigures.
- Out of scope: BrickOwl export, advanced rarity analytics.
- Accessibility: "good enough for MVP"; complex widgets to be revisited (see `docs/BACKLOG.md`).
