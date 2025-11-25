import {
  generateRebrickableCsv,
  type MissingRow,
} from '@/app/lib/export/rebrickableCsv';

describe('generateRebrickableCsv', () => {
  it('omits rows with zero missing quantity and includes BOM + headers', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 0 },
      { setNumber: '1234-1', partId: '3002', colorId: 2, quantityMissing: 5 },
    ];

    const csv = generateRebrickableCsv(rows);

    // Starts with UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');
    expect(lines[0]).toBe('part_num,color_id,quantity');
    expect(lines[1]).toBe('3002,2,5');
    expect(lines.length).toBe(2);
  });
});










