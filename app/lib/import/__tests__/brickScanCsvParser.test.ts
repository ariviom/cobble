import { parseBrickScanCsv } from '../brickScanCsvParser';

const HEADER =
  'ITEMTYPE,ITEMID,COLOR,REMARKS,DESCRIPTION,QTY,CONDITION,PRICE,ITEMNAME,COLORNAME,LOCATION,COLLECTIONNAME,CREATEDAT,THEMENAME,PARTCATEGORYNAME';

describe('parseBrickScanCsv', () => {
  it('parses parts and minifigs', () => {
    const csv = [
      HEADER,
      'P,3001,11,,,2,U,,Brick 2x4,Black,,My Collection,2025-08-25,,Bricks',
      'M,sw0166,0,,,1,U,,Imperial Shadow Trooper,Not Applicable,,My Collection,2025-08-25,Star Wars,',
    ].join('\n');
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      blPartId: '3001',
      blColorId: 11,
      quantity: 2,
    });
    expect(result.minifigs).toHaveLength(1);
    expect(result.minifigs[0]).toEqual({ blMinifigId: 'sw0166', quantity: 1 });
  });

  it('handles quoted fields with commas', () => {
    const csv = [
      HEADER,
      'P,973pb3750,2,,,1,U,,"Torso with Pattern, Complex",Not Selected,,My Collection,2025-10-13,,Parts',
    ].join('\n');
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]!.blPartId).toBe('973pb3750');
  });

  it('skips rows with missing required fields', () => {
    const csv = [HEADER, 'P,,11,,,1,U,,Name,Color,,Col,2025-01-01,,Cat'].join(
      '\n'
    );
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(0);
    expect(result.warnings).toContain('Row 2: missing item ID');
  });

  it('returns empty results for empty input', () => {
    const result = parseBrickScanCsv('');
    expect(result.parts).toHaveLength(0);
    expect(result.minifigs).toHaveLength(0);
  });

  it('handles minimal headers', () => {
    const csv = 'ITEMTYPE,ITEMID,COLOR,QTY\nP,3001,11,1';
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(1);
  });

  it('aggregates duplicate part+color rows', () => {
    const csv = [
      HEADER,
      'P,3001,11,,,5,U,,Brick 2x4,Black,,Col A,2025-08-25,,Bricks',
      'P,3001,11,,,3,U,,Brick 2x4,Black,,Col B,2025-08-25,,Bricks',
      'P,3001,5,,,2,U,,Brick 2x4,Red,,Col A,2025-08-25,,Bricks',
    ].join('\n');
    const result = parseBrickScanCsv(csv);
    expect(result.parts).toHaveLength(2);
    expect(result.parts.find(p => p.blColorId === 11)?.quantity).toBe(8);
    expect(result.parts.find(p => p.blColorId === 5)?.quantity).toBe(2);
  });

  it('aggregates duplicate minifig rows', () => {
    const csv = [
      HEADER,
      'M,sw0166,0,,,1,U,,Imperial Shadow Trooper,Not Applicable,,Col A,2025-08-25,Star Wars,',
      'M,sw0166,0,,,2,U,,Imperial Shadow Trooper,Not Applicable,,Col B,2025-08-25,Star Wars,',
    ].join('\n');
    const result = parseBrickScanCsv(csv);
    expect(result.minifigs).toHaveLength(1);
    expect(result.minifigs[0]?.quantity).toBe(3);
  });
});
