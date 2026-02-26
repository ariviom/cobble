# Custom MOC Upload — Difficulty Analysis

## Context

Users want to upload their own MOC (My Own Creation) inventories as CSV or BrickLink XML files, view them alongside official sets, track owned pieces, and re-upload when the design changes — preserving owned counts for unchanged parts.

This analysis covers what exists, what's new, where the complexity lives, and a phased approach.

---

## What Already Exists (high reuse)

| Component                            | Reuse       | Notes                                                                                       |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------- |
| `InventoryProvider` + `Inventory`    | ~95%        | Renders any `InventoryRow[]` — source-agnostic                                              |
| Export (RB CSV, BL CSV, PAB)         | ~95%        | Operates on `MissingRow[]`, no set assumptions                                              |
| Owned state (IndexedDB `localOwned`) | ~80%        | Keyed by `setNumber` string — `moc:{id}` works without schema changes                       |
| `SyncQueueItem.table` union          | Direct      | Already extensible: `'user_set_parts' \| 'user_lists' \| ...`                               |
| `csv-parse` library                  | Server-only | Used in ingestion scripts; need browser-side parser too                                     |
| File input pattern                   | Partial     | Identify page has `<input type="file">` with ref-click; no drag-drop                        |
| RLS policies                         | Pattern     | Every user table follows `auth.uid() = user_id`                                             |
| Identity resolution                  | ~60%        | `buildResolutionContext()` does batch RB lookups; need reverse (BL→RB) path for XML imports |

## What's New (must be built)

| Component                            | Size  | Risk                                                                      |
| ------------------------------------ | ----- | ------------------------------------------------------------------------- |
| Supabase tables + migration          | S     | Follows `user_lists` pattern exactly                                      |
| CSV/XML parsing (client or server)   | M     | Browser `DOMParser` handles XML; need `papaparse` or server route for CSV |
| Part validation route                | M     | Batch lookup against `rb_parts`; solved pattern but new endpoint          |
| Upload UI (file pick, preview, save) | M     | New page/modal; drag-drop is new                                          |
| Merge diff + resolution              | **L** | Core complexity of the feature                                            |
| `MocTab` type + tab rendering        | M     | Extends `OpenTab` union; touches many files                               |
| Supabase Storage bucket (images)     | M     | First-ever storage usage; config + RLS + client code                      |
| Collection page integration          | M     | Third segment + MocCard + list membership                                 |

---

## Tab/View Reuse Assessment

The inventory view system is almost entirely source-agnostic:

- **`InventoryProvider`** takes a `setNumber` string (used as a key, not validated) and optional `initialInventory: InventoryRow[]`. It doesn't know or care whether rows came from Rebrickable catalog or user upload.
- **`Inventory`**, **`InventoryControls`**, sorting, filtering, grouping, exports — all operate on `InventoryRow[]` / `MissingRow[]` with zero set-specific logic.
- **`useInventory` hook** is the only tightly-coupled piece — it fetches from `/api/inventory?setNumber=...` and caches in IndexedDB. MOCs need a parallel `useMocInventory` that loads from `user_moc_parts` and produces the same `InventoryRow[]` shape.
- **`SetTabContainer`** is heavily wired for Search Party (sessions, channels, participant management). A `MocTabContainer` would be much simpler — just `InventoryProvider` + the standard child components.

**What actually changes**: ~15-20 `isSetTab()` callsites need to also handle `MocTab`. The render loop in `SetsPage` needs a parallel block for MOC tabs. `SetTabBar` needs to render MOC tab items. Everything inside the inventory view is reused unchanged.

**Alternative: MOC as SetTab variant** — Instead of a new `MocTab` type, MOCs could use `SetTab` with a `moc:{id}` convention in `setNumber` and a flag like `isMoc: true`. This avoids all type-guard changes but is less clean. Recommended: proper `MocTab` type for type safety, accept the ~15-20 callsite updates.

---

## Parsing Strategy

**Recommended: Client-side read + parse, server-side validate.**

| Step                             | Where                                          | Why                                                        |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| File reading                     | Client (`FileReader`)                          | Instant, no upload needed                                  |
| CSV parsing                      | Client (split on commas; RB format is trivial) | No library needed for 3-column format                      |
| XML parsing                      | Client (`DOMParser`)                           | Browser-native, no library                                 |
| Stud.io ZIP                      | Client (`JSZip` ~12KB)                         | Avoids uploading large ZIPs; deferred to Phase 3           |
| Part validation + ID mapping     | **Server** (`POST /api/mocs/validate`)         | Needs `rb_parts`, `rb_colors` catalog tables               |
| BL→RB color/part reverse mapping | **Server**                                     | `getColorMaps()` and `rb_parts.bl_part_id` are server-only |

The server route receives a small JSON array of `{ partId, colorId, quantity, system }` (not the raw file), validates against the catalog, and returns enriched rows with names, images, and identity.

---

## Component Details

### 1. Database Schema — S

Two new tables following established patterns:

**`user_mocs`**: `id uuid`, `user_id`, `name`, `description`, `image_url`, `source_url text` (optional external link to Rebrickable/etc), `num_parts`, `version int` (for merge conflict detection), `created_at`, `updated_at`

**`user_moc_parts`**: `moc_id`, `user_id`, `part_num`, `color_id`, `quantity_required`, `part_name`, `color_name`, `image_url`, `bl_part_id`, `bl_color_id`, `element_id`, `updated_at`

Extend `collection_item_type` enum with `'moc'` and add `moc_id uuid` column to `user_list_items` for list membership.

No FK to `rb_parts` — MOC parts may include custom/unofficial parts. Denormalized names/images stored at import time so they survive even if part isn't in catalog. Standard RLS: `auth.uid() = user_id`.

### 2. Import Parsing — M

**Rebrickable CSV** (`part_num,color_id,quantity`): Mirror of the existing export format in `app/lib/export/rebrickableCsv.ts`. Simple 3-column parse.

**BrickLink XML** (`<INVENTORY><ITEM>...</ITEM></INVENTORY>`): Browser's built-in `DOMParser` handles this — no library needed. BL uses different part IDs and color IDs than RB, so import must reverse-map via `rb_parts.bl_part_id` and `rb_colors` color mapping (`getColorMaps()` in `app/lib/colors/colorMapping.ts`).

**Stud.io**: ZIP archive containing an XML parts list. Client-side with `JSZip` (~12KB gzip) — extract in browser, parse XML with `DOMParser`, send parsed rows to server for validation. Avoids uploading large ZIPs. Deferred to Phase 3.

Both produce a normalized `ParsedPart = { partId, colorId, quantity, system: 'rb' | 'bl' }`.

### 3. Part Validation — M

Server-side `POST /api/mocs/validate` route. Accepts `ParsedPart[]`, batch-queries `rb_parts` (batches of ~200 for URL limits), builds partial `PartIdentity` for matched parts, returns `{ matched[], unmatched[] }` with name/image/color info for the UI preview.

For BL-system parts, reverse-lookup via `rb_parts WHERE bl_part_id = ?`. Existing `buildResolutionContext()` in `identityResolution.ts` has the batch lookup pattern.

Unmatched parts are still allowed — stored with user-provided IDs and flagged in the UI.

### 4. Upload UI — M

New flow (likely a modal from the MOC collection page):

1. Name input + optional source URL
2. File drop zone (`.csv`, `.xml`) — drag-drop or click-to-select
3. Auto-detect format from extension/content
4. Parse → validate → show preview table with match status per row
5. Optional image (URL paste in v1, file upload in v3)
6. Save to Supabase

File input pattern from `IdentifyClient.tsx` can be reused. Add `onDragOver`/`onDrop` handlers for drop zone.

### 5. Merge Strategy — L (hardest part)

When re-uploading a CSV for an existing MOC:

**Diff computation** (pure function):

```
computeMocDiff(existing, incoming) → { unchanged, quantityChanged, added, removed }
```

Keyed by `${partNum}:${colorId}` — same canonical key pattern.

**Owned count rules**:

- Unchanged parts: keep owned count
- Quantity increased: keep owned count (now out of higher total)
- Quantity decreased: clamp owned to new total: `min(owned, newQty)`
- New parts: owned = 0
- Removed parts: discard owned data

**Recommended v1 simplification**: Two modes only, no per-part review UI:

1. **Replace all** — wipe and reimport (loses owned counts)
2. **Smart merge** — automatic diff with owned preservation + clamping

This reduces from L to M. Full per-part review UI can come in v2.

### 6. Tab Integration — M

- Add `MocTab` to the `OpenTab` union in `app/store/open-tabs.ts`
- Add `isMocTab()` type guard
- `MocTabContainer` wraps `InventoryProvider` with MOC-sourced rows
- `useMocInventory` hook loads from `user_moc_parts` (or from a local cache)
- Owned state keyed as `moc:{mocId}` in `localOwned` — no IndexedDB schema change needed
- Sync queue: add `'user_moc_parts'` to `SyncQueueItem.table` union

Files touched: `open-tabs.ts`, `SetsPage`, `SetTabBar`, tab persistence, new `MocTabContainer`.

### 7. Collection Page Integration — M

Add `'mocs'` as third segment to the `SegmentedControl` in `UserCollectionOverview.tsx` (alongside Sets and Minifigs). No "All" view for v1.

**`CollectionType = 'sets' | 'minifigs' | 'mocs'`**

MOCs segment: flat grid of `MocCard` components, sorted by name or date. No theme/category filters (MOCs don't have those). List filter works via extended `collection_item_type` enum.

**`MocCard`**: Thumbnail (or `ImagePlaceholder`), MOC name, part count, completion %, optional source link badge. No "Owned" toggle, no year, no theme. Actions: Open in tab, Edit, Re-upload, Delete.

Key file: `app/components/home/UserCollectionOverview.tsx` (lines 844-854 for segment control, 625-648 for type change handler, 920-978 for grid rendering pattern).

### 8. Global Owned Check ("Already Own") — M

Show users which MOC parts they already own across their existing set collection. Two distinct concepts:

1. **"Already own" indicator** — read-only, aggregated from `user_set_parts` across all sets
2. **MOC owned tracking** — per-MOC count for tracking MOC assembly progress (separate)

**Server route**: `POST /api/mocs/check-owned` — accepts an array of `{ partNum, colorId }` from the MOC inventory, queries `user_set_parts` grouped by `(part_num, color_id)` with `SUM(owned_quantity)`, returns `Record<inventoryKey, totalOwned>`.

**Query**:

```sql
SELECT part_num, color_id, SUM(owned_quantity) as total_owned
FROM user_set_parts
WHERE user_id = auth.uid()
  AND (part_num, color_id) IN (...)  -- MOC parts only, batched ~200
  AND is_spare = false
GROUP BY part_num, color_id
HAVING SUM(owned_quantity) > 0
```

**UI**: Each `InventoryItem` in MOC tab shows a secondary indicator: "Own 3 across sets" (or similar badge/tooltip). Distinct from the MOC's own owned count stepper.

**Caching**: TanStack Query with `['global-owned', mocId]` key. Stale time ~5min — changes when user updates owned counts in other tabs. Could also invalidate when owned state changes in any set tab.

**Current architecture gap**: All owned data is per-set today (`user_set_parts` keyed by `set_num`). No global aggregation exists. The Zustand owned store (`app/store/owned.ts`) uses a per-set `Map<string, Record<string, number>>` — no cross-set aggregation method. IndexedDB `localOwned` is also per-`setNumber`. This feature is server-only (requires DB aggregate query).

**Complexity**: The query itself is simple. The UI work is a new indicator on `InventoryItem` (conditional on MOC tabs). The main consideration is cache invalidation — when the user changes owned counts in a set tab, the global-owned data for the MOC tab becomes stale.

### 9. Image Upload — M (deferrable)

First-ever Supabase Storage usage:

- Create `moc-images` bucket with `50MB` limit, `image/png` + `image/jpeg` only
- Storage RLS: users upload to `{user_id}/` folder
- Client-side resize to ~800x600 before upload (canvas API or `browser-image-compression`)
- Add Supabase Storage hostname to `next.config.ts` `remotePatterns`

**v1 simplification**: Accept image URL paste instead of file upload. Eliminates all Storage infrastructure. `ImagePlaceholder` already handles missing images gracefully.

---

## Phased Approach

### Phase 1: Core Upload + View

- Schema migration (user_mocs + user_moc_parts + enum extension + list_items column)
- RB CSV client-side parsing + server-side validation route
- Upload modal (name, file pick, source URL, preview, save)
- Collection page: third "MOCs" segment with MocCard grid + CRUD
- MocTab type + MocTabContainer using existing InventoryProvider
- Owned tracking via `moc:{id}` keying in localOwned
- List membership for MOCs (add to Wishlist, custom lists)
- Global owned check: "already own X across your sets" indicator per part

**Delivers**: Upload RB CSV, view in collection, open as tab, track owned, see what you already own, export missing, add to lists.

### Phase 2: Full Integration

- BrickLink XML import with color/part ID mapping
- Smart merge (replace-with-preservation mode)
- Supabase sync for MOC owned state
- MOC name/source URL inline editing

### Phase 3: Polish

- Image upload via Supabase Storage (or URL paste in v1)
- Full merge review UI with per-part diff
- Stud.io format support (JSZip client-side)

---

## Biggest Risks

1. **Merge strategy UX**: The diff algorithm is simple, but showing it clearly to users is hard. v1 simplification (auto-merge, no review UI) mitigates this.

2. **Tab type proliferation**: Adding `MocTab` to the `OpenTab` union touches every `isSetTab()` / switch-on-type check across the app. Grep shows ~15-20 callsites.

3. **BL→RB reverse mapping**: BL XML imports need reverse color mapping (BL Black=11 → RB Black=0). `getColorMaps()` exists but is server-only. Part reverse-lookup via `rb_parts.bl_part_id` needs a new index or batched query.

4. **Supabase Storage**: First-time bucket setup with storage-specific RLS (different syntax from table RLS). Migration creation is documented but not battle-tested in this codebase.

5. **Owned state sync divergence**: MOC owned data in `user_moc_parts.quantity_owned` vs set owned data in `user_set_parts.owned_quantity`. SyncWorker needs to route to the right table based on key prefix (`moc:` vs set number).

## Overall Assessment

**Total effort**: ~7-10 days for Phases 1+2. Phase 1 alone is ~3-4 days.

**Difficulty**: Medium-High. The individual components are bounded and well-patterned, but the feature touches many systems (tabs, owned state, sync, export, validation). The merge strategy is the only truly novel algorithm. Everything else follows established patterns with extensions.

**New dependencies needed**: `papaparse` (browser CSV, ~6KB) or route the CSV through the server using existing `csv-parse`. No other new libraries required — XML parsing uses native `DOMParser`.

---

## Key Files

| File                                             | Relevance                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `app/store/open-tabs.ts`                         | Extend `OpenTab` union with `MocTab`                                   |
| `app/components/set/InventoryProvider.tsx`       | Core context — MOCs reuse directly                                     |
| `app/components/set/types.ts`                    | `InventoryRow` type MOC rows must match                                |
| `app/lib/services/identityResolution.ts`         | Batch lookup patterns for part validation                              |
| `app/lib/localDb/schema.ts`                      | `SyncQueueItem.table` union extension                                  |
| `app/components/home/UserCollectionOverview.tsx` | Collection page segments + grid                                        |
| `app/lib/export/rebrickableCsv.ts`               | Import format mirror + `MissingRow` type                               |
| `app/lib/colors/colorMapping.ts`                 | BL→RB color reverse mapping                                            |
| `app/hooks/useInventory.ts`                      | Pattern for `useMocInventory`                                          |
| `app/identify/IdentifyClient.tsx`                | File input pattern                                                     |
| `app/store/owned.ts`                             | Per-set owned cache; no cross-set aggregation (server-only for global) |
| `app/api/sync/route.ts`                          | Precedent for `user_set_parts` aggregate queries                       |
