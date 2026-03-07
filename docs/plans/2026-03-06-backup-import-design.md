# Backup & Import Design

**Date:** 2026-03-06
**Status:** Approved
**Location:** Account page, new "Backup & Import" tab

## Overview

Add full collection backup/restore (`.bp` files) and third-party import (BrickScan, Rebrickable) to the account page. Free-tier users can export/import locally; Plus users sync via SyncWorker.

## Data Model

### Supabase: `user_parts_inventory`

Add `loose_quantity integer not null default 0` to distinguish parts added directly (imports, future manual adds) from parts derived from set ownership.

- `quantity` — trigger-managed aggregate from `user_set_parts` (unchanged)
- `loose_quantity` — user-managed, not touched by trigger
- Total available = `quantity + loose_quantity`

**Trigger update (`sync_user_parts_inventory`):**

- Preserve `loose_quantity` when recalculating `quantity`
- Don't delete rows where `loose_quantity > 0` even if set-derived `quantity` drops to 0

**Update `get_missing_parts()`** to use `quantity + loose_quantity` for coverage calculations.

### IndexedDB: Dexie v9

New `localLooseParts` table:

```
partNum: string
colorId: number
quantity: number
updatedAt: number
PK: [partNum+colorId]
```

Mirrors the loose dimension of `user_parts_inventory` for offline use.

### SyncWorker

New sync scope `'user_loose_parts'` added to `SyncQueueItem.table` union.

- **Push:** `localLooseParts` changes → Supabase `user_parts_inventory.loose_quantity`
- **Pull:** `user_parts_inventory` rows where `loose_quantity > 0` → `localLooseParts`

## Brick Party Backup Format (`.bp`)

JSON file with `.bp` extension.

```json
{
  "version": 1,
  "exportedAt": "2026-03-06T12:00:00.000Z",
  "app": "brick-party",
  "data": {
    "sets": [
      {
        "setNumber": "75192-1",
        "status": "owned",
        "hasInstructions": true,
        "hasBox": false
      }
    ],
    "ownedParts": [
      { "setNumber": "75192-1", "inventoryKey": "3023:5", "quantity": 12 }
    ],
    "looseParts": [{ "partNum": "3023", "colorId": 5, "quantity": 3 }],
    "lists": [
      {
        "id": "uuid",
        "name": "Star Wars",
        "items": [{ "itemType": "set", "itemId": "75192-1" }]
      }
    ],
    "minifigs": [{ "figNum": "sw0001", "status": "owned" }]
  },
  "preferences": {
    "theme": "blue",
    "pricing": { "currencyCode": "USD", "countryCode": "US" },
    "minifigSync": { "syncOwnedFromSets": true, "syncScope": "collection" },
    "inventoryDefaults": {}
  }
}
```

## Supported Import Formats

| Source      | Format                      | Extracted Data                                                        |
| ----------- | --------------------------- | --------------------------------------------------------------------- |
| Brick Party | `.bp` JSON                  | Full restore (sets, parts, loose parts, lists, minifigs, preferences) |
| BrickScan   | CSV                         | Parts -> `localLooseParts`, Minifigs -> `user_minifigs`               |
| BrickScan   | XML                         | Same as BrickScan CSV                                                 |
| Rebrickable | CSV (`Set Number,Quantity`) | Sets -> `user_sets` as owned                                          |

### Format Auto-Detection

- File starts with `{` and contains `"app":"brick-party"` -> Brick Party `.bp`
- File starts with `<INVENTORY>` or `<?xml` -> BrickScan XML
- CSV headers contain `ITEMTYPE` and `ITEMID` -> BrickScan CSV
- CSV headers contain `Set Number` -> Rebrickable set list CSV

### BrickScan ID Mapping

BrickScan exports use BrickLink IDs and BrickLink color IDs.

- **Parts:** Map via `rb_parts.bl_part_id`. Parts without `bl_part_id` fall back to same-by-default (RB ID = BL ID).
- **Colors:** Map via `rb_bl_colors` table (BrickLink and Rebrickable color IDs are NOT same-by-default).
- **Minifigs:** Map via `rb_minifigs.bl_minifig_id`.
- **Unmapped items:** Collected and shown to user as warnings after import.

## Conflict Resolution

### Brick Party Restore

1. Alert: "This will replace all your current data. Continue?"
2. Clear local stores (localOwned, localLooseParts, user sets, lists, minifigs, preferences)
3. Write all data from backup
4. Trigger sync for Plus users
5. Show result: "Restored 12 sets, 847 owned parts, 15 loose parts, 3 lists, 22 minifigs"

### Third-Party Import

1. Parse file, build preview: "Found 24 parts, 8 minifigs"
2. Check for overlaps with existing data
3. Show summary: "3 minifigs already in your collection. 24 parts are new."
4. User picks Merge (default) or Replace
   - **Merge:** `max(existing, imported)` for quantities, add new items
   - **Replace:** Clear existing loose parts / minifigs of the imported type, write imported data
5. Write to IndexedDB, enqueue sync

## UI: "Backup & Import" Tab

6th tab on the account page (after Feedback). Two sections:

### Section 1: Backup

- **"Download Backup" button** — generates `.bp` file, filename: `brick-party-YYYY-MM-DD.bp`
- **"Restore from Backup" button** — file picker accepting `.bp` files
- Helper text: "Your backup includes all sets, owned parts, loose parts, lists, minifigs, and preferences."
- On restore: confirmation dialog -> progress -> result summary

### Section 2: Import

- **File upload area** — drag-and-drop or click to browse, accepts `.csv`, `.xml`
- On file selection, show parsed preview:
  - Format badge: "BrickScan CSV" / "BrickScan XML" / "Rebrickable Sets"
  - Summary: "Found 24 parts, 8 minifigs" or "Found 12 sets"
  - Warnings for unmapped items: "3 parts not found in catalog"
  - Overlap summary: "5 minifigs already in your collection"
- **Merge/Replace toggle** (default: Merge)
- **"Import" button** — writes to local DB, shows result summary
- Supported formats listed below upload area as helper text

### Collection Page: Parts Count

Below the Sets and Minifigs segments, add a summary line:
"X parts from Y sets . Z loose parts"

No-op on tap for now (future: browsable parts inventory).

## File Structure

### New Files

- `app/lib/import/formatDetector.ts` — auto-detect format from file content
- `app/lib/import/brickPartyParser.ts` — parse and validate `.bp` files
- `app/lib/import/brickScanCsvParser.ts` — parse BrickScan CSV
- `app/lib/import/brickScanXmlParser.ts` — parse BrickScan XML
- `app/lib/import/rebrickableSetParser.ts` — parse Rebrickable set list CSV
- `app/lib/import/idMapper.ts` — BrickLink -> Rebrickable ID resolution
- `app/lib/export/backupExport.ts` — generate `.bp` JSON from local DB
- `app/account/components/BackupImportTab.tsx` — the new tab UI

### Modified Files

- `supabase/migrations/` — new migration: `loose_quantity` column, trigger update, `get_missing_parts` update
- `app/lib/localDb/schema.ts` — v9 with `localLooseParts` table
- `app/lib/sync/SyncWorker.ts` — new `user_loose_parts` sync scope
- `app/api/sync/route.ts` — handle loose parts sync operations
- `app/account/AccountPageClient.tsx` — add 6th tab
- `app/account/components/index.ts` — export new tab component
- Collection page component — add parts count summary line

### Unchanged

- Existing per-set CSV exporters (inventory view)
- Auth flow (account page already requires auth)
- Existing sync conflict resolution (LWW timestamps)

## Testing

- Unit tests for each parser (valid, malformed, empty files)
- Unit tests for ID mapping (matched, unmatched, edge cases)
- Unit tests for backup export/restore round-trip
- Unit tests for merge vs replace conflict resolution
- Unit tests for format auto-detection
