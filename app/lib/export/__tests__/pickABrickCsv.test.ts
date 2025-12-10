import {
  generatePickABrickCsv,
  type PickABrickResult,
} from '@/app/lib/export/pickABrickCsv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';

describe('generatePickABrickCsv', () => {
  it('emits Element ID and Quantity headers with BOM and skips rows without element IDs', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 3,
        elementId: '123456',
      },
      {
        setNumber: '1234-1',
        partId: '3002',
        colorId: 2,
        quantityMissing: 0,
        elementId: '654321',
      },
      {
        setNumber: '1234-1',
        partId: '3003',
        colorId: 3,
        quantityMissing: 5,
        elementId: null,
      },
    ];

    const { csv, unmapped }: PickABrickResult = generatePickABrickCsv(rows);

    // Starts with UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');
    expect(lines[0]).toBe('Element ID,Quantity');
    // Only the row with a valid elementId and positive quantity should appear
    expect(lines[1]).toBe('123456,3');
    expect(lines.length).toBe(2);

    // One row (missing elementId) should be reported as unmapped
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]?.partId).toBe('3003');
  });
});
