# Backup & Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full collection backup/restore (.bp files) and third-party import (BrickScan, Rebrickable) to the account page.

**Architecture:** Client-side parsers detect format and extract data. BrickScan imports use a server-side API endpoint to map BrickLink IDs to Rebrickable IDs. All writes go to IndexedDB first; SyncWorker handles cloud push for Plus users. A new `loose_quantity` column on `user_parts_inventory` distinguishes imported/manual parts from set-derived parts.

**Tech Stack:** Next.js, Supabase (migrations + RLS), Dexie/IndexedDB, Zustand, Zod, Vitest

**Design doc:** `docs/plans/2026-03-06-backup-import-design.md`

---

## Task 1: Supabase Migration — Loose Parts Column

**Files:**

- Create: `supabase/migrations/<timestamp>_add_loose_quantity.sql`

**Step 1: Create migration file**

```bash
supabase migration new add_loose_quantity
```

**Step 2: Write the migration SQL**

```sql
-- Add loose_quantity to user_parts_inventory
alter table public.user_parts_inventory
  add column if not exists loose_quantity integer not null default 0;

-- Update trigger to preserve loose_quantity and not delete rows with loose parts
create or replace function public.sync_user_parts_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_part_num text;
  v_color_id integer;
  v_total integer;
begin
  v_user_id  := coalesce(new.user_id, old.user_id);
  v_part_num := coalesce(new.part_num, old.part_num);
  v_color_id := coalesce(new.color_id, old.color_id);

  select coalesce(sum(owned_quantity), 0) into v_total
  from user_set_parts
  where user_id = v_user_id
    and part_num = v_part_num
    and color_id = v_color_id;

  if v_total > 0 then
    insert into user_parts_inventory (user_id, part_num, color_id, quantity, loose_quantity, updated_at)
    values (v_user_id, v_part_num, v_color_id, v_total, 0, now())
    on conflict (user_id, part_num, color_id)
    do update set quantity = excluded.quantity, updated_at = now();
    -- Note: loose_quantity is NOT touched by this trigger
  else
    -- Only delete if loose_quantity is also 0
    delete from user_parts_inventory
    where user_id = v_user_id
      and part_num = v_part_num
      and color_id = v_color_id
      and loose_quantity = 0;
    -- If loose_quantity > 0, just zero out the set-derived quantity
    update user_parts_inventory
    set quantity = 0, updated_at = now()
    where user_id = v_user_id
      and part_num = v_part_num
      and color_id = v_color_id
      and loose_quantity > 0;
  end if;

  return coalesce(new, old);
end;
$$;

-- Update get_missing_parts to use quantity + loose_quantity
create or replace function public.get_missing_parts(
  p_user_id uuid,
  p_set_num text
)
returns table (
  part_num text,
  color_id int,
  part_name text,
  color_name text,
  img_url text,
  required_qty int,
  owned_qty int,
  missing_qty int
)
language sql
stable
security definer
set search_path = public
as $$
  with set_parts as (
    select sp.part_num, sp.color_id, sp.quantity
    from mv_set_parts sp
    where sp.set_num = p_set_num
  ),
  owned_set_nums as (
    select us.set_num
    from user_sets us
    where us.user_id = p_user_id and us.owned = true
  ),
  effective_parts as (
    select part_num, color_id, max(quantity) as quantity
    from (
      select sp.part_num, sp.color_id, sp.quantity
      from owned_set_nums os
      join mv_set_parts sp on sp.set_num = os.set_num
      union all
      select upi.part_num, upi.color_id, (upi.quantity + upi.loose_quantity) as quantity
      from user_parts_inventory upi
      where upi.user_id = p_user_id
    ) combined
    group by part_num, color_id
  )
  select
    sp.part_num,
    sp.color_id,
    p.name as part_name,
    c.name as color_name,
    ip.img_url,
    sp.quantity as required_qty,
    coalesce(ep.quantity, 0) as owned_qty,
    sp.quantity - coalesce(ep.quantity, 0) as missing_qty
  from set_parts sp
  left join effective_parts ep
    on ep.part_num = sp.part_num and ep.color_id = sp.color_id
  join rb_parts p on p.part_num = sp.part_num
  join rb_colors c on c.id = sp.color_id
  left join lateral (
    select ip2.img_url
    from rb_inventories inv
    join rb_inventory_parts ip2
      on ip2.inventory_id = inv.id
      and ip2.part_num = sp.part_num
      and ip2.color_id = sp.color_id
    where inv.set_num = p_set_num
    order by inv.id desc
    limit 1
  ) ip on true
  where coalesce(ep.quantity, 0) < sp.quantity
  order by (sp.quantity - coalesce(ep.quantity, 0)) desc, p.name;
$$;
```

**Step 3: Regenerate TypeScript types**

Run: `npm run generate-types`

**Step 4: Commit**

```
Add loose_quantity column to user_parts_inventory
```

---

## Task 2: Dexie v9 Schema — localLooseParts Table

**Files:**

- Modify: `app/lib/localDb/schema.ts`

**Step 1: Add LocalLoosePart type**

After the `LocalCollectionItem` type (line ~151), add:

```typescript
/**
 * Loose parts not tied to any set (imported or manually added).
 * Mirrors user_parts_inventory.loose_quantity for offline use.
 */
export type LocalLoosePart = {
  partNum: string;
  colorId: number;
  quantity: number;
  updatedAt: number;
};
```

**Step 2: Add table to BrickPartyDB class**

Add after `localCollectionItems` declaration:

```typescript
localLooseParts!: EntityTable<LocalLoosePart, 'partNum'>;
```

**Step 3: Add SyncQueueItem table union member**

Update `SyncQueueItem.table` type to include `'user_loose_parts'`:

```typescript
table: 'user_set_parts' |
  'user_lists' |
  'user_list_items' |
  'user_minifigs' |
  'user_loose_parts';
```

**Step 4: Add Dexie v9 schema version**

After the v8 block, add:

```typescript
// Version 9: Add localLooseParts table for imported/manual loose parts.
this.version(9).stores({
  catalogSets: 'setNumber, themeId, year, cachedAt',
  catalogParts: 'partNum, categoryId, parentCategory, cachedAt',
  catalogColors: 'id, cachedAt',
  catalogSetParts:
    '++id, setNumber, partNum, colorId, inventoryKey, [setNumber+inventoryKey], [setNumber+colorId]',
  catalogSetMeta: 'setNumber, inventoryCachedAt, inventoryVersion',
  catalogMinifigs: 'figNum, cachedAt',

  localOwned:
    '++id, setNumber, inventoryKey, [setNumber+inventoryKey], updatedAt',
  localCollections: 'id, userId, type, updatedAt',
  localCollectionItems: '++id, collectionId, itemType, itemId, addedAt',
  localLooseParts: '[partNum+colorId], partNum, colorId, updatedAt',

  syncQueue: '++id, userId, table, createdAt, retryCount',
  meta: 'key',

  uiState: 'key',
  recentSets: 'setNumber, visitedAt',
});
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```
Add localLooseParts table to Dexie v9 schema
```

---

## Task 3: Format Detector

**Files:**

- Create: `app/lib/import/formatDetector.ts`
- Create: `app/lib/import/__tests__/formatDetector.test.ts`

**Step 1: Write tests**

```typescript
import { detectFormat, type ImportFormat } from '../formatDetector';

describe('detectFormat', () => {
  it('detects Brick Party .bp JSON', () => {
    const content = JSON.stringify({
      version: 1,
      app: 'brick-party',
      data: {},
    });
    expect(detectFormat(content)).toBe('brick-party');
  });

  it('detects BrickScan XML', () => {
    const content =
      '<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE></ITEM></INVENTORY>';
    expect(detectFormat(content)).toBe('brickscan-xml');
  });

  it('detects BrickScan XML with xml declaration', () => {
    const content = '<?xml version="1.0"?><INVENTORY></INVENTORY>';
    expect(detectFormat(content)).toBe('brickscan-xml');
  });

  it('detects BrickScan CSV by headers', () => {
    const content = 'ITEMTYPE,ITEMID,COLOR,QTY\nP,3001,11,1';
    expect(detectFormat(content)).toBe('brickscan-csv');
  });

  it('detects BrickScan CSV case-insensitively', () => {
    const content = 'itemtype,itemid,color,qty\nP,3001,11,1';
    expect(detectFormat(content)).toBe('brickscan-csv');
  });

  it('detects Rebrickable set list CSV', () => {
    const content = 'Set Number,Quantity\n75192-1,1';
    expect(detectFormat(content)).toBe('rebrickable-sets');
  });

  it('returns null for unrecognized content', () => {
    expect(detectFormat('random text')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectFormat('')).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/lib/import/__tests__/formatDetector.test.ts`
Expected: FAIL — module not found

**Step 3: Implement format detector**

```typescript
export type ImportFormat =
  | 'brick-party'
  | 'brickscan-csv'
  | 'brickscan-xml'
  | 'rebrickable-sets';

/**
 * Auto-detect import format from file content.
 * Returns null if format is not recognized.
 */
export function detectFormat(content: string): ImportFormat | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  // JSON: Brick Party backup
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.app === 'brick-party') return 'brick-party';
    } catch {
      // Not valid JSON
    }
    return null;
  }

  // XML: BrickScan XML export
  if (trimmed.startsWith('<INVENTORY>') || trimmed.startsWith('<?xml')) {
    return 'brickscan-xml';
  }

  // CSV: check first line for known headers
  const firstLine = trimmed.split('\n')[0]?.toUpperCase() ?? '';

  if (firstLine.includes('ITEMTYPE') && firstLine.includes('ITEMID')) {
    return 'brickscan-csv';
  }

  if (firstLine.includes('SET NUMBER')) {
    return 'rebrickable-sets';
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/lib/import/__tests__/formatDetector.test.ts`
Expected: All PASS

**Step 5: Commit**

```
Add import format auto-detector
```

---

## Task 4: BrickScan CSV Parser

**Files:**

- Create: `app/lib/import/brickScanCsvParser.ts`
- Create: `app/lib/import/__tests__/brickScanCsvParser.test.ts`

Reference file for format: `ui_ref/bl_export.csv`

Headers: `ITEMTYPE,ITEMID,COLOR,REMARKS,DESCRIPTION,QTY,CONDITION,PRICE,ITEMNAME,COLORNAME,LOCATION,COLLECTIONNAME,CREATEDAT,THEMENAME,PARTCATEGORYNAME`

**Step 1: Write tests**

```typescript
import { parseBrickScanCsv, type BrickScanItem } from '../brickScanCsvParser';

const HEADER =
  'ITEMTYPE,ITEMID,COLOR,REMARKS,DESCRIPTION,QTY,CONDITION,PRICE,ITEMNAME,COLORNAME,LOCATION,COLLECTIONNAME,CREATEDAT,THEMENAME,PARTCATEGORYNAME';

describe('parseBrickScanCsv', () => {
  it('parses parts and minifigs', () => {
    const csv = [
      HEADER,
      'P,3001,11,,,2,U,,Brick 2x4,Black,,My Collection,2025-08-25,,Bricks',
      'M,sw0166,0,,,1,U,,Imperial Shadow Trooper,Not Applicable,,My Collection,2025-08-25,Star Wars,',
    ].join('\n');

    const result = parseBrickScanCsv(csv);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      blPartId: '3001',
      blColorId: 11,
      quantity: 2,
    });
    expect(result.minifigs).toHaveLength(1);
    expect(result.minifigs[0]).toEqual({
      blMinifigId: 'sw0166',
      quantity: 1,
    });
  });

  it('handles quoted fields with commas', () => {
    const csv = [
      HEADER,
      'P,973pb3750,2,,,1,U,,"Torso with Pattern, Complex",Not Selected,,My Collection,2025-10-13,,Parts',
    ].join('\n');
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]!.blPartId).toBe('973pb3750');
  });

  it('skips rows with missing required fields', () => {
    const csv = [HEADER, 'P,,11,,,1,U,,Name,Color,,Col,2025-01-01,,Cat'].join(
      '\n'
    );
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(0);
    expect(result.warnings).toContain('Row 2: missing item ID');
  });

  it('returns empty results for empty input', () => {
    const result = parseBrickScanCsv('');
    expect(result.parts).toHaveLength(0);
    expect(result.minifigs).toHaveLength(0);
  });

  it('handles minimal headers (only required columns)', () => {
    const csv = 'ITEMTYPE,ITEMID,COLOR,QTY\nP,3001,11,1';
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/lib/import/__tests__/brickScanCsvParser.test.ts`

**Step 3: Implement parser**

```typescript
export type BrickScanPart = {
  blPartId: string;
  blColorId: number;
  quantity: number;
};

export type BrickScanMinifig = {
  blMinifigId: string;
  quantity: number;
};

export type BrickScanParseResult = {
  parts: BrickScanPart[];
  minifigs: BrickScanMinifig[];
  warnings: string[];
};

/**
 * Parse a CSV row respecting quoted fields.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse BrickScan CSV export (BrickLink format).
 * Headers are case-insensitive and position-independent.
 */
export function parseBrickScanCsv(content: string): BrickScanParseResult {
  const parts: BrickScanPart[] = [];
  const minifigs: BrickScanMinifig[] = [];
  const warnings: string[] = [];

  const lines = content.trim().split('\n');
  if (lines.length < 2) return { parts, minifigs, warnings };

  // Map headers to column indices
  const headers = parseCsvRow(lines[0]!).map(h => h.trim().toUpperCase());
  const col = (name: string) => headers.indexOf(name);

  const iType = col('ITEMTYPE');
  const iId = col('ITEMID');
  const iColor = col('COLOR');
  const iQty = col('QTY');

  if (iType === -1 || iId === -1) {
    warnings.push('Missing required headers: ITEMTYPE, ITEMID');
    return { parts, minifigs, warnings };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const fields = parseCsvRow(line);
    const itemType = fields[iType]?.trim().toUpperCase();
    const itemId = fields[iId]?.trim();
    const colorStr = iColor !== -1 ? fields[iColor]?.trim() : '0';
    const qtyStr = iQty !== -1 ? fields[iQty]?.trim() : '1';

    if (!itemId) {
      warnings.push(`Row ${i + 1}: missing item ID`);
      continue;
    }

    const quantity = parseInt(qtyStr ?? '1', 10) || 1;

    if (itemType === 'P') {
      const colorId = parseInt(colorStr ?? '0', 10);
      if (isNaN(colorId)) {
        warnings.push(`Row ${i + 1}: invalid color ID "${colorStr}"`);
        continue;
      }
      parts.push({ blPartId: itemId, blColorId: colorId, quantity });
    } else if (itemType === 'M') {
      minifigs.push({ blMinifigId: itemId, quantity });
    }
    // Skip other item types (S=set, B=book, etc.)
  }

  return { parts, minifigs, warnings };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/lib/import/__tests__/brickScanCsvParser.test.ts`

**Step 5: Commit**

```
Add BrickScan CSV parser
```

---

## Task 5: BrickScan XML Parser

**Files:**

- Create: `app/lib/import/brickScanXmlParser.ts`
- Create: `app/lib/import/__tests__/brickScanXmlParser.test.ts`

Reference file: `ui_ref/bl_export.xml` — `<INVENTORY>` root with `<ITEM>` children containing `<ITEMTYPE>`, `<ITEMID>`, `<COLOR>`, `<QTY>`, etc.

**Step 1: Write tests**

```typescript
import { parseBrickScanXml } from '../brickScanXmlParser';

describe('parseBrickScanXml', () => {
  it('parses parts and minifigs from XML', () => {
    const xml = `<INVENTORY>
      <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR><QTY>2</QTY></ITEM>
      <ITEM><ITEMTYPE>M</ITEMTYPE><ITEMID>sw0166</ITEMID><COLOR>0</COLOR><QTY>1</QTY></ITEM>
    </INVENTORY>`;

    const result = parseBrickScanXml(xml);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      blPartId: '3001',
      blColorId: 11,
      quantity: 2,
    });
    expect(result.minifigs).toHaveLength(1);
    expect(result.minifigs[0]).toEqual({ blMinifigId: 'sw0166', quantity: 1 });
  });

  it('handles xml declaration', () => {
    const xml =
      '<?xml version="1.0"?><INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR><QTY>1</QTY></ITEM></INVENTORY>';
    const result = parseBrickScanXml(xml);
    expect(result.parts).toHaveLength(1);
  });

  it('defaults quantity to 1 if missing', () => {
    const xml =
      '<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>11</COLOR></ITEM></INVENTORY>';
    const result = parseBrickScanXml(xml);
    expect(result.parts[0]!.quantity).toBe(1);
  });

  it('warns on items with missing ITEMID', () => {
    const xml =
      '<INVENTORY><ITEM><ITEMTYPE>P</ITEMTYPE><COLOR>11</COLOR><QTY>1</QTY></ITEM></INVENTORY>';
    const result = parseBrickScanXml(xml);
    expect(result.parts).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty for empty inventory', () => {
    const result = parseBrickScanXml('<INVENTORY></INVENTORY>');
    expect(result.parts).toHaveLength(0);
    expect(result.minifigs).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement parser**

Use DOMParser (available in browser). Reuse the same `BrickScanPart`/`BrickScanMinifig`/`BrickScanParseResult` types from the CSV parser.

```typescript
import type { BrickScanParseResult } from './brickScanCsvParser';

function getTagText(item: Element, tag: string): string | null {
  return item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? null;
}

/**
 * Parse BrickScan XML export (BrickLink wanted list format).
 */
export function parseBrickScanXml(content: string): BrickScanParseResult {
  const parts: BrickScanParseResult['parts'] = [];
  const minifigs: BrickScanParseResult['minifigs'] = [];
  const warnings: string[] = [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    warnings.push(
      'Invalid XML: ' +
        (parserError.textContent?.slice(0, 100) ?? 'parse error')
    );
    return { parts, minifigs, warnings };
  }

  const items = doc.getElementsByTagName('ITEM');
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const itemType = getTagText(item, 'ITEMTYPE')?.toUpperCase();
    const itemId = getTagText(item, 'ITEMID');
    const colorStr = getTagText(item, 'COLOR') ?? '0';
    const qtyStr = getTagText(item, 'QTY') ?? '1';

    if (!itemId) {
      warnings.push(`Item ${i + 1}: missing ITEMID`);
      continue;
    }

    const quantity = parseInt(qtyStr, 10) || 1;

    if (itemType === 'P') {
      const colorId = parseInt(colorStr, 10);
      if (isNaN(colorId)) {
        warnings.push(`Item ${i + 1}: invalid COLOR "${colorStr}"`);
        continue;
      }
      parts.push({ blPartId: itemId, blColorId: colorId, quantity });
    } else if (itemType === 'M') {
      minifigs.push({ blMinifigId: itemId, quantity });
    }
  }

  return { parts, minifigs, warnings };
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```
Add BrickScan XML parser
```

---

## Task 6: Rebrickable Set List Parser

**Files:**

- Create: `app/lib/import/rebrickableSetParser.ts`
- Create: `app/lib/import/__tests__/rebrickableSetParser.test.ts`

Format: `Set Number,Quantity` (headers case-insensitive, order-independent)

**Step 1: Write tests**

```typescript
import {
  parseRebrickableSetList,
  type RebrickableSet,
} from '../rebrickableSetParser';

describe('parseRebrickableSetList', () => {
  it('parses set numbers and quantities', () => {
    const csv = 'Set Number,Quantity\n75192-1,1\n10294-1,2';
    const result = parseRebrickableSetList(csv);
    expect(result.sets).toEqual([
      { setNumber: '75192-1', quantity: 1 },
      { setNumber: '10294-1', quantity: 2 },
    ]);
  });

  it('handles reversed column order', () => {
    const csv = 'Quantity,Set Number\n1,75192-1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets[0]).toEqual({ setNumber: '75192-1', quantity: 1 });
  });

  it('defaults quantity to 1 if column missing', () => {
    const csv = 'Set Number\n75192-1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets[0]!.quantity).toBe(1);
  });

  it('skips rows with empty set number', () => {
    const csv = 'Set Number,Quantity\n,1\n75192-1,1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets).toHaveLength(1);
  });

  it('warns on missing Set Number header', () => {
    const csv = 'Name,Count\nFoo,1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty for empty input', () => {
    const result = parseRebrickableSetList('');
    expect(result.sets).toHaveLength(0);
  });
});
```

**Step 2: Run tests, verify fail**

**Step 3: Implement parser**

```typescript
export type RebrickableSet = {
  setNumber: string;
  quantity: number;
};

export type RebrickableSetParseResult = {
  sets: RebrickableSet[];
  warnings: string[];
};

/**
 * Parse Rebrickable set list CSV.
 * Headers are case-insensitive and order-independent.
 */
export function parseRebrickableSetList(
  content: string
): RebrickableSetParseResult {
  const sets: RebrickableSet[] = [];
  const warnings: string[] = [];

  const lines = content.trim().split('\n');
  if (lines.length < 2) return { sets, warnings };

  const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase());
  const setNumCol = headers.findIndex(
    h => h === 'set number' || h === 'setnumber' || h === 'set_number'
  );
  const qtyCol = headers.findIndex(h => h === 'quantity' || h === 'qty');

  if (setNumCol === -1) {
    warnings.push('Missing required header: Set Number');
    return { sets, warnings };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i]!.split(',').map(f => f.trim());
    const setNumber = fields[setNumCol]?.trim();
    if (!setNumber) continue;

    const quantity =
      qtyCol !== -1 ? parseInt(fields[qtyCol] ?? '1', 10) || 1 : 1;
    sets.push({ setNumber, quantity });
  }

  return { sets, warnings };
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```
Add Rebrickable set list CSV parser
```

---

## Task 7: Brick Party Backup Parser

**Files:**

- Create: `app/lib/import/brickPartyParser.ts`
- Create: `app/lib/import/__tests__/brickPartyParser.test.ts`

**Step 1: Write tests**

```typescript
import { parseBrickPartyBackup } from '../brickPartyParser';

describe('parseBrickPartyBackup', () => {
  const validBackup = {
    version: 1,
    exportedAt: '2026-03-06T12:00:00.000Z',
    app: 'brick-party',
    data: {
      sets: [
        {
          setNumber: '75192-1',
          status: 'owned',
          hasInstructions: true,
          hasBox: false,
        },
      ],
      ownedParts: [
        { setNumber: '75192-1', inventoryKey: '3023:5', quantity: 12 },
      ],
      looseParts: [{ partNum: '3023', colorId: 5, quantity: 3 }],
      lists: [
        {
          id: 'abc',
          name: 'Star Wars',
          items: [{ itemType: 'set', itemId: '75192-1' }],
        },
      ],
      minifigs: [{ figNum: 'sw0001', status: 'owned' }],
    },
    preferences: {
      theme: 'blue',
      pricing: { currencyCode: 'USD', countryCode: 'US' },
      minifigSync: { syncOwnedFromSets: true, syncScope: 'collection' },
      inventoryDefaults: {},
    },
  };

  it('parses a valid backup', () => {
    const result = parseBrickPartyBackup(JSON.stringify(validBackup));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.data.sets).toHaveLength(1);
    expect(result.data.data.looseParts).toHaveLength(1);
    expect(result.data.data.minifigs).toHaveLength(1);
  });

  it('rejects non-brick-party JSON', () => {
    const result = parseBrickPartyBackup(JSON.stringify({ app: 'other' }));
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const result = parseBrickPartyBackup('not json');
    expect(result.success).toBe(false);
  });

  it('accepts backup with missing optional fields', () => {
    const minimal = {
      version: 1,
      app: 'brick-party',
      data: {
        sets: [],
        ownedParts: [],
        looseParts: [],
        lists: [],
        minifigs: [],
      },
    };
    const result = parseBrickPartyBackup(JSON.stringify(minimal));
    expect(result.success).toBe(true);
  });

  it('rejects unsupported version', () => {
    const future = { ...validBackup, version: 999 };
    const result = parseBrickPartyBackup(JSON.stringify(future));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('version');
    }
  });
});
```

**Step 2: Run tests, verify fail**

**Step 3: Implement parser**

Use Zod for validation. Define the backup schema matching the design doc format.

```typescript
import { z } from 'zod';

const backupSetSchema = z.object({
  setNumber: z.string().min(1),
  status: z.string().default('owned'),
  hasInstructions: z.boolean().optional(),
  hasBox: z.boolean().optional(),
});

const backupOwnedPartSchema = z.object({
  setNumber: z.string().min(1),
  inventoryKey: z.string().min(1),
  quantity: z.number().int().min(0),
});

const backupLoosePartSchema = z.object({
  partNum: z.string().min(1),
  colorId: z.number().int().min(0),
  quantity: z.number().int().min(1),
});

const backupListItemSchema = z.object({
  itemType: z.union([z.literal('set'), z.literal('minifig')]),
  itemId: z.string().min(1),
});

const backupListSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  items: z.array(backupListItemSchema),
});

const backupMinifigSchema = z.object({
  figNum: z.string().min(1),
  status: z.string().default('owned'),
});

const backupDataSchema = z.object({
  sets: z.array(backupSetSchema),
  ownedParts: z.array(backupOwnedPartSchema),
  looseParts: z.array(backupLoosePartSchema),
  lists: z.array(backupListSchema),
  minifigs: z.array(backupMinifigSchema),
});

const backupPreferencesSchema = z
  .object({
    theme: z.string().optional(),
    pricing: z
      .object({
        currencyCode: z.string().optional(),
        countryCode: z.string().nullable().optional(),
      })
      .optional(),
    minifigSync: z
      .object({
        syncOwnedFromSets: z.boolean().optional(),
        syncScope: z
          .union([z.literal('collection'), z.literal('owned')])
          .optional(),
      })
      .optional(),
    inventoryDefaults: z.record(z.unknown()).optional(),
  })
  .optional();

const SUPPORTED_VERSIONS = [1];

const backupSchema = z.object({
  version: z.number().int(),
  exportedAt: z.string().optional(),
  app: z.literal('brick-party'),
  data: backupDataSchema,
  preferences: backupPreferencesSchema,
});

export type BrickPartyBackup = z.infer<typeof backupSchema>;

export type BrickPartyParseResult =
  | { success: true; data: BrickPartyBackup }
  | { success: false; error: string };

/**
 * Parse and validate a Brick Party .bp backup file.
 */
export function parseBrickPartyBackup(content: string): BrickPartyParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }

  // Check version before full validation
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
    const version = (parsed as { version: unknown }).version;
    if (typeof version === 'number' && !SUPPORTED_VERSIONS.includes(version)) {
      return {
        success: false,
        error: `Unsupported backup version ${version}. Supported: ${SUPPORTED_VERSIONS.join(', ')}`,
      };
    }
  }

  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: `Invalid backup: ${firstIssue?.path.join('.')} — ${firstIssue?.message}`,
    };
  }

  return { success: true, data: result.data };
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```
Add Brick Party .bp backup parser with Zod validation
```

---

## Task 8: Backup Export Generator

**Files:**

- Create: `app/lib/export/backupExport.ts`
- Create: `app/lib/export/__tests__/backupExport.test.ts`

This reads from local stores and IndexedDB to produce the `.bp` JSON. It's a client-side module.

**Step 1: Write tests**

Test the assembly function with injected data (don't depend on actual IndexedDB in unit tests).

```typescript
import { assembleBackup, type BackupSources } from '../backupExport';

describe('assembleBackup', () => {
  const sources: BackupSources = {
    sets: [
      {
        setNumber: '75192-1',
        status: 'owned',
        hasInstructions: true,
        hasBox: false,
      },
    ],
    ownedParts: [
      { setNumber: '75192-1', inventoryKey: '3023:5', quantity: 12 },
    ],
    looseParts: [{ partNum: '3023', colorId: 5, quantity: 3 }],
    lists: [
      {
        id: 'abc',
        name: 'Favs',
        items: [{ itemType: 'set' as const, itemId: '75192-1' }],
      },
    ],
    minifigs: [{ figNum: 'sw0001', status: 'owned' }],
    preferences: { theme: 'blue' },
  };

  it('assembles a valid backup with version and app fields', () => {
    const backup = assembleBackup(sources);
    expect(backup.version).toBe(1);
    expect(backup.app).toBe('brick-party');
    expect(backup.exportedAt).toBeDefined();
    expect(backup.data.sets).toEqual(sources.sets);
    expect(backup.data.looseParts).toEqual(sources.looseParts);
  });

  it('round-trips through JSON serialization', () => {
    const backup = assembleBackup(sources);
    const json = JSON.stringify(backup);
    const parsed = JSON.parse(json);
    expect(parsed.data.sets).toEqual(sources.sets);
    expect(parsed.data.looseParts).toEqual(sources.looseParts);
  });

  it('handles empty sources', () => {
    const backup = assembleBackup({
      sets: [],
      ownedParts: [],
      looseParts: [],
      lists: [],
      minifigs: [],
      preferences: {},
    });
    expect(backup.data.sets).toHaveLength(0);
  });
});
```

**Step 2: Run tests, verify fail**

**Step 3: Implement**

```typescript
import type { BrickPartyBackup } from '@/app/lib/import/brickPartyParser';

export type BackupSources = {
  sets: BrickPartyBackup['data']['sets'];
  ownedParts: BrickPartyBackup['data']['ownedParts'];
  looseParts: BrickPartyBackup['data']['looseParts'];
  lists: BrickPartyBackup['data']['lists'];
  minifigs: BrickPartyBackup['data']['minifigs'];
  preferences: Record<string, unknown>;
};

/**
 * Assemble a Brick Party backup object from local data sources.
 */
export function assembleBackup(sources: BackupSources): BrickPartyBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'brick-party',
    data: {
      sets: sources.sets,
      ownedParts: sources.ownedParts,
      looseParts: sources.looseParts,
      lists: sources.lists,
      minifigs: sources.minifigs,
    },
    preferences: sources.preferences as BrickPartyBackup['preferences'],
  };
}

/**
 * Trigger browser download of a .bp backup file.
 */
export function downloadBackup(backup: BrickPartyBackup): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `brick-party-${date}.bp`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```
Add backup export generator
```

---

## Task 9: ID Mapping API Route

**Files:**

- Create: `app/api/import/map-ids/route.ts`
- Test manually or via integration test

BrickScan imports need server-side ID mapping (BrickLink → Rebrickable) because:

- Color mapping uses `rb_colors.external_ids` (server-only via `colorMapping.ts`)
- Part mapping uses `rb_parts.bl_part_id` (Supabase query)
- Minifig mapping uses `rb_minifigs.bl_minifig_id` (Supabase query)

**Step 1: Implement the route**

```typescript
import 'server-only';

import { getBlToRbColorMap } from '@/app/lib/colors/colorMapping';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  parts: z
    .array(
      z.object({
        blPartId: z.string().min(1),
        blColorId: z.number().int().min(0),
      })
    )
    .max(500),
  minifigs: z
    .array(
      z.object({
        blMinifigId: z.string().min(1),
      })
    )
    .max(200),
});

type MappedPart = {
  blPartId: string;
  blColorId: number;
  rbPartNum: string | null;
  rbColorId: number | null;
};

type MappedMinifig = {
  blMinifigId: string;
  rbFigNum: string | null;
};

export const POST = withCsrfProtection(async (req: NextRequest) => {
  // Require auth (account page context)
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('unauthorized');

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
    });
  }

  const { parts, minifigs } = parsed.data;
  const catalog = getCatalogReadClient();

  // --- Map colors ---
  const blToRbColor = await getBlToRbColorMap();

  // --- Map parts ---
  // Collect unique BL part IDs
  const uniqueBlPartIds = [...new Set(parts.map(p => p.blPartId))];
  const blToRbPart = new Map<string, string>();

  // Query rb_parts for bl_part_id matches (batch in chunks of 200)
  for (let i = 0; i < uniqueBlPartIds.length; i += 200) {
    const batch = uniqueBlPartIds.slice(i, i + 200);
    const { data } = await catalog
      .from('rb_parts')
      .select('part_num, bl_part_id')
      .in('bl_part_id', batch);

    for (const row of data ?? []) {
      if (row.bl_part_id) {
        blToRbPart.set(row.bl_part_id, row.part_num);
      }
    }
  }

  const mappedParts: MappedPart[] = parts.map(p => ({
    blPartId: p.blPartId,
    blColorId: p.blColorId,
    // Try explicit mapping, then fall back to same-by-default
    rbPartNum: blToRbPart.get(p.blPartId) ?? p.blPartId,
    rbColorId: blToRbColor.get(p.blColorId) ?? null,
  }));

  // --- Map minifigs ---
  const uniqueBlMinifigIds = [...new Set(minifigs.map(m => m.blMinifigId))];
  const blToRbMinifig = new Map<string, string>();

  for (let i = 0; i < uniqueBlMinifigIds.length; i += 200) {
    const batch = uniqueBlMinifigIds.slice(i, i + 200);
    const { data } = await catalog
      .from('rb_minifigs')
      .select('fig_num, bl_minifig_id')
      .in('bl_minifig_id', batch);

    for (const row of data ?? []) {
      if (row.bl_minifig_id) {
        blToRbMinifig.set(row.bl_minifig_id, row.fig_num);
      }
    }
  }

  const mappedMinifigs: MappedMinifig[] = minifigs.map(m => ({
    blMinifigId: m.blMinifigId,
    rbFigNum: blToRbMinifig.get(m.blMinifigId) ?? null,
  }));

  return NextResponse.json({ parts: mappedParts, minifigs: mappedMinifigs });
});
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```
Add BrickLink-to-Rebrickable ID mapping API route
```

---

## Task 10: Sync Route Update — Loose Parts

**Files:**

- Modify: `app/api/sync/route.ts`

**Step 1: Add loose parts payload schema and processing**

Add after `userSetPartsPayloadSchema` (line ~39):

```typescript
const userLoosePartsPayloadSchema = z.object({
  part_num: z.string().min(1).max(VALIDATION.PART_NUM_MAX),
  color_id: z.number().int().min(0).max(VALIDATION.COLOR_ID_MAX),
  loose_quantity: z.number().int().min(0).max(VALIDATION.OWNED_QTY_MAX),
});
```

Update `syncOperationSchema.table` to accept both tables:

```typescript
table: z.union([z.literal('user_set_parts'), z.literal('user_loose_parts')]),
```

Update `payload` to be a union:

```typescript
payload: z.union([userSetPartsPayloadSchema, userLoosePartsPayloadSchema]),
```

Add processing logic for `user_loose_parts` operations after the `user_set_parts` block. Loose parts upsert to `user_parts_inventory` setting `loose_quantity`. Deletes set `loose_quantity = 0` (and delete the row if `quantity` is also 0).

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```
Add loose parts sync support to /api/sync route
```

---

## Task 11: BackupImportTab UI Component

**Files:**

- Create: `app/account/components/BackupImportTab.tsx`
- Modify: `app/account/components/index.ts` — add export
- Modify: `app/account/AccountPageClient.tsx` — add 6th tab

**Step 1: Create the tab component**

Build two sections (Backup & Restore, Import). Use existing UI primitives: `Button`, `Alert`, file input.

The component needs:

- "Download Backup" button → calls `assembleBackup()` with data from stores, then `downloadBackup()`
- "Restore from Backup" button → file picker for `.bp`, parse, confirm dialog, write to local DB
- Import section: file upload area, format detection, preview, merge/replace toggle, import button

The data gathering for backup export reads from:

- `useUserSetsStore` (sets)
- `useOwnedStore` (owned parts — needs to iterate all hydrated sets)
- `localLooseParts` table (IndexedDB)
- User lists (from localStorage hook or Supabase)
- User minifigs (from API or local)
- Preferences (from localStorage + account data props)

This is a larger component. Implement in phases:

1. Layout with both sections
2. Backup download working
3. File upload + format detection + preview
4. Restore flow
5. Third-party import flow

**Step 2: Add to account page**

In `app/account/components/index.ts`, add:

```typescript
export { BackupImportTab } from './BackupImportTab';
```

In `app/account/AccountPageClient.tsx`:

- Add import: `BackupImportTab` to the destructured imports from `./components`
- Add tab trigger after "Feedback": `<TabsTrigger value="backup">Backup & Import</TabsTrigger>`
- Add tab content after the feedback TabsContent:

```tsx
<TabsContent value="backup">
  <BackupImportTab user={user} />
</TabsContent>
```

**Step 3: Verify it renders**

Open `/account` in browser, verify "Backup & Import" tab appears and renders.

**Step 4: Commit**

```
Add Backup & Import tab to account page
```

---

## Task 12: Collection Page — Parts Count

**Files:**

- Modify: `app/components/home/UserCollectionOverview.tsx`

**Step 1: Add parts count display**

Find the area between `CollectionHero` and `CollectionControlBar` (around lines 728-754). Add a summary stats line.

Compute:

- Total parts = sum of `numParts` across owned sets
- Loose parts count = query `localLooseParts` table count

Display: `"X parts from Y sets · Z loose parts"` as a muted text line below the hero section. Only show if either count > 0.

**Step 2: Verify it renders**

Check the collection page shows the parts count.

**Step 3: Commit**

```
Add parts count summary to collection page
```

---

## Task 13: Integration — Wire Up Import Flows

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx`

**Step 1: Wire up BrickScan import flow**

1. On file select → `detectFormat()` → parse with appropriate parser
2. If BrickScan → call `/api/import/map-ids` with extracted BL IDs
3. Show preview with mapped counts + unmapped warnings
4. On import confirm → write to `localLooseParts` (parts) and enqueue minifig syncs
5. Show result summary

**Step 2: Wire up Rebrickable import flow**

1. Parse set list → call user sets store to mark sets as owned
2. Show preview with set count
3. On import confirm → write to user sets store

**Step 3: Wire up Brick Party restore flow**

1. Parse `.bp` → validate
2. Show confirmation dialog
3. On confirm → clear local data → write all from backup → apply preferences
4. Show result summary

**Step 4: Test each flow manually**

- Import `ui_ref/bl_export.csv` → verify parts/minifigs imported
- Import `ui_ref/bl_export.xml` → verify same result
- Export backup → restore backup → verify data matches

**Step 5: Commit**

```
Wire up import/restore flows in BackupImportTab
```

---

## Task Summary

| Task | Description                              | Dependencies          |
| ---- | ---------------------------------------- | --------------------- |
| 1    | Supabase migration (loose_quantity)      | None                  |
| 2    | Dexie v9 schema (localLooseParts)        | None                  |
| 3    | Format detector                          | None                  |
| 4    | BrickScan CSV parser                     | None                  |
| 5    | BrickScan XML parser                     | Task 4 (shared types) |
| 6    | Rebrickable set list parser              | None                  |
| 7    | Brick Party backup parser                | None                  |
| 8    | Backup export generator                  | Task 7 (types)        |
| 9    | ID mapping API route                     | None                  |
| 10   | Sync route update (loose parts)          | Task 1                |
| 11   | BackupImportTab UI + account integration | Tasks 2-8             |
| 12   | Collection page parts count              | Task 2                |
| 13   | Integration — wire up flows              | Tasks 9-11            |

**Parallelizable:** Tasks 1-9 are all independent and can be built in parallel. Tasks 10-13 have dependencies as noted.
