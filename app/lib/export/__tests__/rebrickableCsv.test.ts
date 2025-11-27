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

  it('returns only headers when all rows have zero missing quantity', () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 0 },
      { setNumber: '1234-1', partId: '3002', colorId: 2, quantityMissing: 0 },
    ];

    const csv = generateRebrickableCsv(rows);
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

    expect(lines[0]).toBe('part_num,color_id,quantity');
    expect(lines.length).toBe(1); // Only header, no data rows
  });

  it('returns only headers for empty input array', () => {
    const csv = generateRebrickableCsv([]);
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

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
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

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
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

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
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

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
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');

    // elementId should not appear in output
    expect(lines[1]).toBe('3001,1,2');
    expect(lines[1]).not.toContain('300123');
  });
});











