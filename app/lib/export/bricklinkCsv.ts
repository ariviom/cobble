import { toCsv } from '@/app/lib/export/csv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { mapToBrickLink } from '@/app/lib/mappings/rebrickableToBricklink';

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

export async function generateBrickLinkCsv(
  rows: MissingRow[],
  opts: BrickLinkOptions
): Promise<BrickLinkExportResult> {
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
    // Fast path: use identity when available (no HTTP calls needed)
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

    // Fallback: use mapToBrickLink for rows without identity (stale cache)
    const mapped = await mapToBrickLink(r.partId, r.colorId);
    if (!mapped) {
      unmapped.push(r);
      continue;
    }

    if (mapped.itemType === 'MINIFIG' && r.partId.startsWith('fig:')) {
      exportedMinifigIds.push(r.partId.replace(/^fig:/, ''));
    }

    body.push([
      mapped.itemType === 'MINIFIG' ? 'M' : 'P',
      mapped.itemNo,
      mapped.colorId ?? 0,
      r.quantityMissing,
      opts.condition ?? 'U',
      `${opts.wantedListName}`,
    ]);
  }
  return {
    csv: toCsv(headers, body, /* includeBom */ true),
    unmapped,
    exportedMinifigIds,
  };
}
