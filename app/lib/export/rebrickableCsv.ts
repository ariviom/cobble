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

export type RebrickableOptions = {
  /** Include minifig parents and subparts (default: false). */
  includeMinifigs?: boolean;
};

// Rebrickable import spec generally supports headers: part_num,color_id,quantity
export function generateRebrickableCsv(
  rows: MissingRow[],
  opts?: RebrickableOptions
): string {
  const isMinifig = (r: MissingRow) =>
    r.identity?.rowType.startsWith('minifig_');

  const nonMinifigRows = rows
    .filter(r => !isMinifig(r))
    .filter(r => r.quantityMissing > 0);

  const minifigRows = opts?.includeMinifigs
    ? rows.filter(r => isMinifig(r))
    : [];

  const headers = ['part_num', 'color_id', 'quantity'];
  const body = [
    ...nonMinifigRows.map(r => [r.partId, r.colorId, r.quantityMissing]),
    ...minifigRows.map(r => [r.partId, r.colorId, r.quantityRequired ?? 0]),
  ];
  return toCsv(headers, body, /* includeBom */ true);
}
