import {
  clampOwned,
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from '@/app/components/set/inventory-utils';

describe('inventory-utils', () => {
  it('clampOwned enforces 0 <= value <= required', () => {
    expect(clampOwned(-5, 10)).toBe(0);
    expect(clampOwned(0, 10)).toBe(0);
    expect(clampOwned(5, 10)).toBe(5);
    expect(clampOwned(999, 10)).toBe(10);
  });

  it('computeMissing never goes below 0', () => {
    expect(computeMissing(10, 0)).toBe(10);
    expect(computeMissing(10, 5)).toBe(5);
    expect(computeMissing(10, 10)).toBe(0);
    expect(computeMissing(10, 15)).toBe(0);
  });

  it('parseStudAreaFromName parses WxL patterns', () => {
    expect(parseStudAreaFromName('Plate 2 x 4')).toBe(8);
    expect(parseStudAreaFromName('Brick 1×6')).toBe(6);
    expect(parseStudAreaFromName('Tile 1x1 round')).toBe(1);
    expect(parseStudAreaFromName('Random Part')).toBeNull();
  });

  it('deriveCategory returns first alpha token', () => {
    expect(deriveCategory('Brick 2 x 4')).toBe('Brick');
    expect(deriveCategory('Plate, Modified 1x2')).toBe('Plate');
    expect(deriveCategory('   ')).toBe('Part');
  });
});










