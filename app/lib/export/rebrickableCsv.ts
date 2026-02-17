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
  identity?: import('@/app/lib/domain/partIdentity').PartIdentity | undefined;
  /** Total required quantity for this part in the set */
  quantityRequired?: number;
};

// Rebrickable import spec generally supports headers: part_num,color_id,quantity
export function generateRebrickableCsv(rows: MissingRow[]): string {
  // Exclude minifig parent rows — Rebrickable only accepts parts, not minifigs.
  // Minifig subparts are real parts and import fine.
  const filtered = rows.filter(
    r => r.identity?.rowType !== 'minifig_parent' && r.quantityMissing > 0
  );

  const headers = ['part_num', 'color_id', 'quantity'];
  const body = filtered.map(r => [r.partId, r.colorId, r.quantityMissing]);
  return toCsv(headers, body, /* includeBom */ true);
}
