import { toCsv } from '@/app/lib/export/csv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';

export type BrickLinkOptions = {
  wantedListName: string;
  condition?: 'N' | 'U';
};

export type BrickLinkExportResult = {
  csv: string;
  unmapped: MissingRow[];
  /** Rebrickable fig IDs (without 'fig:' prefix) for minifigs included in the export */
  exportedMinifigIds: string[];
};

// BrickLink wanted list CSV typical headers:
// Create a typical subset: Item Type,Item No,Color,Quantity,Condition,Description,Comments,Extra,Image,Minimum Price,Maximum Price,Tier Quantity1,Tier Price1, ... (we'll use essentials)
// We'll include wanted list name in Description for portability if importer doesn't accept a separate name field.

export function generateBrickLinkCsv(
  rows: MissingRow[],
  opts: BrickLinkOptions
): BrickLinkExportResult {
  const filtered = rows.filter(r => r.quantityMissing > 0);
  const headers = [
    'Item Type',
    'Item No',
    'Color',
    'Quantity',
    'Condition',
    'Description',
  ];
  const body: Array<Array<string | number>> = [];
  const unmapped: MissingRow[] = [];
  const exportedMinifigIds: string[] = [];

  for (const r of filtered) {
    const id = r.identity;
    if (id) {
      if (id.rowType === 'minifig_parent' && id.blMinifigId) {
        exportedMinifigIds.push(id.blMinifigId);
        body.push([
          'M',
          id.blMinifigId,
          0,
          r.quantityMissing,
          opts.condition ?? 'U',
          `${opts.wantedListName}`,
        ]);
        continue;
      }
      if (id.blPartId != null && id.blColorId != null) {
        body.push([
          'P',
          id.blPartId,
          id.blColorId,
          r.quantityMissing,
          opts.condition ?? 'U',
          `${opts.wantedListName}`,
        ]);
        continue;
      }
    }

    // No identity or missing BL IDs — cannot map this row
    unmapped.push(r);
  }
  return {
    csv: toCsv(headers, body, /* includeBom */ true),
    unmapped,
    exportedMinifigIds,
  };
}
