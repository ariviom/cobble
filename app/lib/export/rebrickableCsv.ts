import { toCsv } from '@/app/lib/export/csv';

export type MissingRow = {
  setNumber: string;
  partId: string;
  colorId: number;
  quantityMissing: number;
};

// Rebrickable import spec generally supports headers: part_num,color_id,quantity
export function generateRebrickableCsv(rows: MissingRow[]): string {
  const filtered = rows.filter(r => r.quantityMissing > 0);
  const headers = ['part_num', 'color_id', 'quantity'];
  const body = filtered.map(r => [r.partId, r.colorId, r.quantityMissing]);
  return toCsv(headers, body, /* includeBom */ true);
}
