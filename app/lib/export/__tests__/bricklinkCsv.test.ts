import { vi } from 'vitest';
import {
  generateBrickLinkCsv,
  type BrickLinkOptions,
} from '@/app/lib/export/bricklinkCsv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';

vi.mock('@/app/lib/mappings/rebrickableToBricklink', () => ({
  mapToBrickLink: vi.fn(async (partId: string, colorId: number) => {
    if (partId === 'UNMAPPED') return null;
    return {
      itemType: partId.startsWith('fig:') ? 'MINIFIG' : 'PART',
      itemNo: partId,
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
    const opts: BrickLinkOptions = { wantedListName: 'My Wanted List', condition: 'N' };

    const { csv, unmapped } = await generateBrickLinkCsv(rows, opts);

    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]?.partId).toBe('UNMAPPED');

    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');
    expect(lines[0]).toBe(
      'Item Type,Item No,Color,Quantity,Condition,Description'
    );
    // First mapped part row
    expect(lines[1]).toBe('P,3001,1,3,N,My Wanted List');
    // Minifig row uses item type M
    expect(lines[2]).toBe('M,fig:pirate,0,1,N,My Wanted List');
  });
});



