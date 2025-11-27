import { toCsv } from '@/app/lib/export/csv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';

export type PickABrickResult = {
  csv: string;
  unmapped: MissingRow[];
};

/**
 * Generate a CSV compatible with LEGO Pick-a-Brick upload.
 *
 * Format (per LEGO's current spec):
 *   - Headers: "Element ID","Quantity"
 *   - One row per element ID with a strictly positive missing quantity.
 *
 * Rows without a known `elementId` are skipped and returned in `unmapped`
 * so callers can display a warning.
 */
export function generatePickABrickCsv(rows: MissingRow[]): PickABrickResult {
  const filtered = rows.filter(r => r.quantityMissing > 0);
  const headers = ['Element ID', 'Quantity'];

  const body: Array<Array<string | number>> = [];
  const unmapped: MissingRow[] = [];

  for (const r of filtered) {
    const elementId = r.elementId;
    if (!elementId) {
      unmapped.push(r);
      continue;
    }
    body.push([elementId, r.quantityMissing]);
  }

  return {
    csv: toCsv(headers, body, /* includeBom */ true),
    unmapped,
  };
}












