import {
  generateBrickLinkCsv,
  type BrickLinkOptions,
} from '@/app/lib/export/bricklinkCsv';
import {
  createCatalogPartIdentity,
  createMinifigParentIdentity,
  createUnmatchedSubpartIdentity,
} from '@/app/lib/domain/partIdentity';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';

describe('generateBrickLinkCsv', () => {
  it('maps parts with identity to BrickLink format and collects unmapped rows', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 3,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 11, null),
      },
      {
        setNumber: '1234-1',
        partId: 'fig:pirate',
        colorId: 0,
        quantityMissing: 1,
        identity: createMinifigParentIdentity('pirate'),
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

    const { csv, unmapped } = generateBrickLinkCsv(rows, opts);

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
    expect(lines[1]).toBe('P,BL-3001,11,3,N,My Wanted List');
    // Minifig row uses item type M
    expect(lines[2]).toBe('M,pirate,0,1,N,My Wanted List');
  });

  it('defaults to Used condition when not specified', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 2,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 1, null),
      },
    ];
    const opts: BrickLinkOptions = { wantedListName: 'Test List' };

    const { csv } = generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    // Should default to 'U' for used condition
    expect(lines[1]).toBe('P,BL-3001,1,2,U,Test List');
  });

  it('omits rows with zero missing quantity', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 0,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 1, null),
      },
      {
        setNumber: '1234-1',
        partId: '3002',
        colorId: 2,
        quantityMissing: 3,
        identity: createCatalogPartIdentity('3002', 2, 'BL-3002', 2, null),
      },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'Test List',
      condition: 'N',
    };

    const { csv, unmapped } = generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(unmapped).toHaveLength(0);
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[1]).toBe('P,BL-3002,2,3,N,Test List');
  });

  it('returns only headers for empty input', () => {
    const opts: BrickLinkOptions = {
      wantedListName: 'Empty List',
      condition: 'N',
    };

    const { csv, unmapped } = generateBrickLinkCsv([], opts);
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

  it('returns all unmapped when no rows have identity', () => {
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

    const { csv, unmapped } = generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    expect(unmapped).toHaveLength(2);
    expect(lines.length).toBe(1); // Only header
  });

  it('includes UTF-8 BOM', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 1,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 1, null),
      },
    ];
    const opts: BrickLinkOptions = { wantedListName: 'Test' };

    const { csv } = generateBrickLinkCsv(rows, opts);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes special characters in wanted list name', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 1,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 1, null),
      },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'List with, comma',
      condition: 'N',
    };

    const { csv } = generateBrickLinkCsv(rows, opts);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');

    // The wanted list name with comma should be quoted
    expect(lines[1]).toBe('P,BL-3001,1,1,N,"List with, comma"');
  });

  it('returns exported minifig IDs for confidence logging', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 2,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 1, null),
      },
      {
        setNumber: '1234-1',
        partId: 'fig:fig-001234',
        colorId: 0,
        quantityMissing: 1,
        identity: createMinifigParentIdentity('fig-001234'),
      },
      {
        setNumber: '1234-1',
        partId: 'fig:fig-005678',
        colorId: 0,
        quantityMissing: 1,
        identity: createMinifigParentIdentity('fig-005678'),
      },
      {
        setNumber: '1234-1',
        partId: 'UNMAPPED',
        colorId: 5,
        quantityMissing: 1,
      },
    ];
    const opts: BrickLinkOptions = {
      wantedListName: 'Test List',
      condition: 'N',
    };

    const { exportedMinifigIds } = generateBrickLinkCsv(rows, opts);

    // Should include fig IDs without the 'fig:' prefix
    expect(exportedMinifigIds).toEqual(['fig-001234', 'fig-005678']);
  });

  it('returns empty exportedMinifigIds when no minifigs in export', () => {
    const rows: MissingRow[] = [
      {
        setNumber: '1234-1',
        partId: '3001',
        colorId: 1,
        quantityMissing: 2,
        identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 1, null),
      },
      {
        setNumber: '1234-1',
        partId: '3002',
        colorId: 2,
        quantityMissing: 1,
        identity: createCatalogPartIdentity('3002', 2, 'BL-3002', 2, null),
      },
    ];
    const opts: BrickLinkOptions = { wantedListName: 'Test' };

    const { exportedMinifigIds } = generateBrickLinkCsv(rows, opts);

    expect(exportedMinifigIds).toEqual([]);
  });

  describe('identity fast path', () => {
    it('uses identity BL IDs directly', () => {
      const rows: MissingRow[] = [
        {
          setNumber: '1234-1',
          partId: '3001',
          colorId: 1,
          quantityMissing: 3,
          identity: createCatalogPartIdentity('3001', 1, 'BL-3001', 11, null),
        },
      ];
      const opts: BrickLinkOptions = {
        wantedListName: 'Test',
        condition: 'N',
      };

      const { csv, unmapped } = generateBrickLinkCsv(rows, opts);

      expect(unmapped).toHaveLength(0);
      const lines = csv
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\n');
      expect(lines[1]).toBe('P,BL-3001,11,3,N,Test');
    });

    it('uses identity for minifig parent rows', () => {
      const rows: MissingRow[] = [
        {
          setNumber: '1234-1',
          partId: 'fig:sw0001',
          colorId: 0,
          quantityMissing: 1,
          identity: createMinifigParentIdentity('sw0001'),
        },
      ];
      const opts: BrickLinkOptions = {
        wantedListName: 'Test',
        condition: 'N',
      };

      const { csv, unmapped, exportedMinifigIds } = generateBrickLinkCsv(
        rows,
        opts
      );

      expect(unmapped).toHaveLength(0);
      expect(exportedMinifigIds).toEqual(['sw0001']);
      const lines = csv
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\n');
      expect(lines[1]).toBe('M,sw0001,0,1,N,Test');
    });

    it('adds to unmapped when identity lacks BL IDs', () => {
      const rows: MissingRow[] = [
        {
          setNumber: '1234-1',
          partId: '3001',
          colorId: 1,
          quantityMissing: 2,
          identity: createCatalogPartIdentity('3001', 1, null, null, null),
        },
      ];
      const opts: BrickLinkOptions = {
        wantedListName: 'Test',
        condition: 'N',
      };

      const { unmapped } = generateBrickLinkCsv(rows, opts);

      expect(unmapped).toHaveLength(1);
      expect(unmapped[0]?.partId).toBe('3001');
    });

    it('uses identity for unmatched subparts', () => {
      const rows: MissingRow[] = [
        {
          setNumber: '1234-1',
          partId: '973pb1234',
          colorId: 11,
          quantityMissing: 1,
          identity: createUnmatchedSubpartIdentity('973pb1234', 11),
        },
      ];
      const opts: BrickLinkOptions = {
        wantedListName: 'Test',
        condition: 'U',
      };

      const { csv, unmapped } = generateBrickLinkCsv(rows, opts);

      expect(unmapped).toHaveLength(0);
      const lines = csv
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\n');
      expect(lines[1]).toBe('P,973pb1234,11,1,U,Test');
    });
  });
});
