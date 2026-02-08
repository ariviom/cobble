# Architectural Rewrite Plans

Seven plans for restructuring Brick Party's core systems, each independently deployable and incrementally reversible.

## Plans at a Glance

| # | Plan | Difficulty | Lines Changed | Key Win |
|---|------|-----------|--------------|---------|
| 01 | ~~[Split Inventory Context](01-split-inventory-context.md)~~ | ~~Hard~~ | ~~~200~~ | **DONE** (0b19ce9) — 58-field mega-context → 5 focused contexts; eliminates cascading re-renders |
| 02 | ~~[Unified Part Identity](02-unified-part-identity.md)~~ | ~~Hard~~ | ~~~600~~ | **DONE** — Single `PartIdentity` object replaces scattered RB↔BL reconciliation; exports use identity fast path |
| 03 | ~~[Server-Driven Inventory](03-server-driven-inventory.md)~~ | ~~Medium~~ | ~~-418 net~~ | **DONE** (fcc9c56) — Eliminates client-side minifig enrichment; single-phase loading |
| 04 | ~~[Tab Unmount + Cache](04-tab-unmount-cache.md)~~ | ~~Medium~~ | ~~~50~~ | **DONE** (c602545) — Mount only active tab; 10 tabs → 1/10th DOM nodes |
| 05 | ~~[SyncEngine](05-sync-engine.md)~~ | ~~Hard~~ | ~~~800~~ | **DONE** — Unified SyncWorker class at app root; fixes bug where owned changes never reach Supabase from main sets page |
| 06 | [Identify Pipeline](06-identify-pipeline.md) | Medium-Hard | ~400 | Route handler 275→120 lines; three-stage pipeline with typed budget |
| 07 | [Normalize Color System](07-normalize-color-system.md) | Medium | ~300 | BL→RB color mapping at ingestion; removes runtime API call from hot path |
| 08 | [BrickLink Part Validation](08-bricklink-part-validation.md) | TBD | TBD | Query BrickLink API to resolve unmapped parts; self-healing when RB lacks BL mapping |

## Themes

**Identity & Color Normalization (02, 07):** The root cause of the most persistent bug class -- duplicate inventory rows -- is that RB and BL use different ID systems for parts and colors. Plan 07 moves color mapping to ingestion time. Plan 02 creates a canonical `PartIdentity` object server-side so downstream code never needs to care which system an ID came from.

**Simplify the Client (01, 03, 04):** The client currently does too much. Plan 03 eliminates client-side minifig enrichment entirely (~418 lines deleted, 3 files removed). ~~Plan 01 splits the 58-field InventoryProvider into 5 focused contexts so a toast dismissal doesn't re-render the inventory grid~~ **(DONE)**. Plan 04 unmounts inactive tabs, dropping DOM pressure proportionally to open tab count.

**Reliable Sync (05):** Owned-quantity synchronization is spread across 5 files with no single owner. Worse, the sync worker only mounts on the group page -- owned changes from the main sets flow never reach Supabase. Plan 05 consolidates everything into a `SyncEngine` class mounted at app root, with observable status and surfaced errors.

**Clean Boundaries (06):** The identify route handler interleaves HTTP concerns with business logic across 275 lines. Plan 06 restructures it into a three-stage pipeline (recognize → resolve → findSets) with a result-based budget instead of thrown-error flow control.

## Execution Order

```
✅ 01 Split Context ────────   DONE (0b19ce9)
✅ 02 Part Identity ───────   DONE (328ab17)
✅ 03 Server-Driven ───────   DONE (fcc9c56)
✅ 04 Tab Unmount ─────────   DONE (c602545)
✅ 05 SyncEngine ──────────   DONE

07 Normalize Colors ─────┐
                         │
06 Identify Pipeline ────┘   (remaining work)

06 Identify Pipeline ────    (fully independent, lowest priority)
```

**Rationale:**
1. **07 first** -- Foundation. Normalizing colors at ingestion simplifies both 02 and 03.
2. **02 next** -- Builds on 07. Eliminates the #1 bug class (duplicate rows from ID mismatches).
3. **03 follows 02** -- With identity resolved server-side, client enrichment becomes unnecessary. Also shrinks DataContext (Plan 01) by removing ~6 enrichment fields.
4. **05 in parallel** -- Fixes a real user-facing bug (sync not working outside group page). Independent of identity/color work.
5. **04 anytime** -- Smallest diff (~2 files), clean performance win, no dependencies.
6. **06 last** -- Identify is less trafficked. Pure refactor with no user-facing change.

## Bug Found During Analysis

**Sync worker mounting bug (documented in 05):** The `DataProvider` component that contains the sync worker (`performSync`, interval drain, visibility/unload hooks) is only mounted on the group page via `LocalDataProviderBoundary`. It is **not** in the root layout. This means for the main sets flow:
- `useSupabaseOwned` enqueues owned changes to the IndexedDB sync queue
- But the queue is **never drained to the server** unless the user visits a group page

This affects all logged-in users tracking owned quantities on the main sets page. Their data persists locally (IndexedDB) but does not sync to Supabase until/unless they join a group session. Plan 05 fixes this by moving the sync loop to a root-level `SyncProvider`.

## Risk Profile

All plans share these safety properties:
- **Incremental:** Each plan is broken into phases that can ship independently
- **Type-safe:** TypeScript catches field mismatches immediately on context/type changes
- **Reversible:** No destructive database migrations; additive columns, feature flags, dual-read patterns
- **Testable:** Existing 243+ tests provide a regression baseline; each plan includes specific test additions

The highest-risk items are the owned-data key migration in Plan 02 (mitigated by dual-read) and the SyncEngine extraction in Plan 05 (mitigated by using the same IndexedDB tables with no schema changes).
