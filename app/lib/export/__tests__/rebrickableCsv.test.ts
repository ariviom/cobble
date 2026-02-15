import {
  generateRebrickableCsv,
  type MissingRow,
} from '@/app/lib/export/rebrickableCsv';
import type { PartIdentity } from '@/app/lib/domain/partIdentity';

function minifigIdentity(
  rowType:
    | 'minifig_parent'
    | 'minifig_subpart_matched'
    | 'minifig_subpart_unmatched',
  opts?: { rbFigNum?: string; rbPartId?: string }
): PartIdentity {
  return {
    canonicalKey: 'test',
    rbPartId: opts?.rbPartId ?? 'test',
    rbColorId: 0,
    blPartId: null,
    blColorId: null,
    elementId: null,
    rowType,
    blMinifigId: null,
    rbFigNum: opts?.rbFigNum ?? null,
  };
}

describe('generateRebrickableCsv', () => {
  it('omits rows with zero missing quantity and includes BOM + headers', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 0 },
      { setNumber: '1234-1', partId: '3002', colorId: 2, quantityMissing: 5 },
    ];

    const csv = generateRebrickableCsv(rows);

    // Starts with UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');
    expect(lines[0]).toBe('part_num,color_id,quantity');
    expect(lines[1]).toBe('3002,2,5');
    expect(lines.length).toBe(2);
  });

  it('returns only headers when all rows have zero missing quantity', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 0 },
      { setNumber: '1234-1', partId: '3002', colorId: 2, quantityMissing: 0 },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines[0]).toBe('part_num,color_id,quantity');
    expect(lines.length).toBe(1); // Only header, no data rows
  });

  it('returns only headers for empty input array', () => {
    const csv = generateRebrickableCsv([]);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines[0]).toBe('part_num,color_id,quantity');
    expect(lines.length).toBe(1);
  });

  it('handles multiple rows correctly', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 3 },
      { setNumber: '1234-1', partId: '3002', colorId: 2, quantityMissing: 5 },
      { setNumber: '1234-1', partId: '3003', colorId: 15, quantityMissing: 1 },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines.length).toBe(4); // header + 3 data rows
    expect(lines[1]).toBe('3001,1,3');
    expect(lines[2]).toBe('3002,2,5');
    expect(lines[3]).toBe('3003,15,1');
  });

  it('preserves part IDs with special characters', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '973pb1234c01',
        colorId: 1,
        quantityMissing: 2,
      },
      {
        setNumber: '1234-1',
        partId: '2336p68',
        colorId: 0,
        quantityMissing: 1,
      },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines[1]).toBe('973pb1234c01,1,2');
    expect(lines[2]).toBe('2336p68,0,1');
  });

  it('handles large quantities', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 9999,
      },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines[1]).toBe('3001,1,9999');
  });

  it('ignores elementId field in output', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 2,
        elementId: '300123',
      },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    // elementId should not appear in output
    expect(lines[1]).toBe('3001,1,2');
    expect(lines[1]).not.toContain('300123');
  });

  it('excludes minifig rows by default', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 3 },
      {
        setNumber: '1234-1',
        partId: 'fig-001',
        colorId: 0,
        quantityMissing: 1,
        quantityRequired: 1,
        identity: minifigIdentity('minifig_parent'),
      },
      {
        setNumber: '1234-1',
        partId: '973c01',
        colorId: 5,
        quantityMissing: 1,
        quantityRequired: 1,
        identity: minifigIdentity('minifig_subpart_matched'),
      },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines.length).toBe(2); // header + 1 non-minifig row
    expect(lines[1]).toBe('3001,1,3');
  });

  it('includes minifig rows with quantityRequired when includeMinifigs is true', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 3 },
      {
        setNumber: '1234-1',
        partId: 'fig:sw0001',
        colorId: 0,
        quantityMissing: 1,
        quantityRequired: 2,
        identity: minifigIdentity('minifig_parent', {
          rbFigNum: 'fig-000001',
        }),
      },
    ];

    const csv = generateRebrickableCsv(rows, { includeMinifigs: true });
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines.length).toBe(3); // header + 1 regular + 1 minifig
    expect(lines[1]).toBe('3001,1,3');
    // Uses rbFigNum for RB export, not BL minifig ID
    expect(lines[2]).toBe('fig-000001,0,2');
  });

  it('includes minifig rows even when quantityMissing is 0 if includeMinifigs is true', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '973c01',
        colorId: 5,
        quantityMissing: 0,
        quantityRequired: 1,
        identity: minifigIdentity('minifig_subpart_matched', {
          rbPartId: '973c01',
        }),
      },
    ];

    const csv = generateRebrickableCsv(rows, { includeMinifigs: true });
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(lines.length).toBe(2); // header + 1 minifig row
    expect(lines[1]).toBe('973c01,5,1'); // uses quantityRequired
  });
});
