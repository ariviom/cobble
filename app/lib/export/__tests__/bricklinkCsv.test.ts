import { vi } from 'vitest';
import {
  generateBrickLinkCsv,
  type BrickLinkOptions,
} from '@/app/lib/export/bricklinkCsv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';

vi.mock('@/app/lib/mappings/rebrickableToBricklink', () => ({
  mapToBrickLink: vi.fn(async (partId: string, colorId: number) => {
    if (partId === 'UNMAPPED') return null;
    if (partId === 'UNMAPPED2') return null;
    return {
      itemType: partId.startsWith('fig:') ? 'MINIFIG' : 'PART',
      itemNo: `BL-${partId}`,
      colorId,
    };
  }),
}));

describe('generateBrickLinkCsv', () => {
  it('maps parts to BrickLink format and collects unmapped rows', async () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 3 },
      {
        setNumber: '1234-1',
        partId: 'fig:pirate',
        colorId: 0,
        quantityMissing: 1,
      },
      {
        setNumber: '1234-1',
        partId: 'UNMAPPED',
        colorId: 5,
        quantityMissing: 2,
      },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'My Wanted List',
      condition: 'N',
    };

    const { csv, unmapped } = await generateBrickLinkCsv(rows, opts);

    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]?.partId).toBe('UNMAPPED');

    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');
    expect(lines[0]).toBe(
      'Item Type,Item No,Color,Quantity,Condition,Description'
    );
    // First mapped part row
    expect(lines[1]).toBe('P,BL-3001,1,3,N,My Wanted List');
    // Minifig row uses item type M
    expect(lines[2]).toBe('M,BL-fig:pirate,0,1,N,My Wanted List');
  });

  it('defaults to Used condition when not specified', async () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 2 },
    ];
    const opts: BrickLinkOptions = { wantedListName: 'Test List' };

    const { csv } = await generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    // Should default to 'U' for used condition
    expect(lines[1]).toBe('P,BL-3001,1,2,U,Test List');
  });

  it('omits rows with zero missing quantity', async () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 0 },
      { setNumber: '1234-1', partId: '3002', colorId: 2, quantityMissing: 3 },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'Test List',
      condition: 'N',
    };

    const { csv, unmapped } = await generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(unmapped).toHaveLength(0);
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[1]).toBe('P,BL-3002,2,3,N,Test List');
  });

  it('returns only headers for empty input', async () => {
    const opts: BrickLinkOptions = {
      wantedListName: 'Empty List',
      condition: 'N',
    };

    const { csv, unmapped } = await generateBrickLinkCsv([], opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(unmapped).toHaveLength(0);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(
      'Item Type,Item No,Color,Quantity,Condition,Description'
    );
  });

  it('returns all unmapped when all rows fail to map', async () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: 'UNMAPPED',
        colorId: 1,
        quantityMissing: 2,
      },
      {
        setNumber: '1234-1',
        partId: 'UNMAPPED2',
        colorId: 5,
        quantityMissing: 3,
      },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'Test List',
      condition: 'N',
    };

    const { csv, unmapped } = await generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(unmapped).toHaveLength(2);
    expect(lines.length).toBe(1); // Only header
  });

  it('includes UTF-8 BOM', async () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 1 },
    ];
    const opts: BrickLinkOptions = { wantedListName: 'Test' };

    const { csv } = await generateBrickLinkCsv(rows, opts);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes special characters in wanted list name', async () => {
    const rows: MissingRow[] = [
      { setNumber: '1234-1', partId: '3001', colorId: 1, quantityMissing: 1 },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'List with, comma',
      condition: 'N',
    };

    const { csv } = await generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    // The wanted list name with comma should be quoted
    expect(lines[1]).toBe('P,BL-3001,1,1,N,"List with, comma"');
  });
});
