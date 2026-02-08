import { toCsv } from '@/app/lib/export/csv';

export type MissingRow = {
  setNumber: string;
  partId: string;
  colorId: number;
  quantityMissing: number;
  /**
   * Optional LEGO element ID for this part/color, when known.
   * Not required for Rebrickable / BrickLink exports but used for
   * LEGO Pick-a-Brick CSV export.
   */
  elementId?: string | null;
  /** Unified part identity when available (from server-side resolution) */
  identity?: import('@/app/lib/domain/partIdentity').PartIdentity;
};

export type RebrickableOptions = {
  /** Include minifig parents and subparts (default: false). */
  includeMinifigs?: boolean;
};

// Rebrickable import spec generally supports headers: part_num,color_id,quantity
export function generateRebrickableCsv(
  rows: MissingRow[],
  opts?: RebrickableOptions
): string {
  let filtered = rows.filter(r => r.quantityMissing > 0);

  if (!opts?.includeMinifigs) {
    filtered = filtered.filter(
      r => !r.identity?.rowType.startsWith('minifig_')
    );
  }

  const headers = ['part_num', 'color_id', 'quantity'];
  const body = filtered.map(r => [r.partId, r.colorId, r.quantityMissing]);
  return toCsv(headers, body, /* includeBom */ true);
}
