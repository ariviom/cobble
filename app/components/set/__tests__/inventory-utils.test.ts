import {
  clampOwned,
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from '@/app/components/set/inventory-utils';

describe('clampOwned', () => {
  it('enforces minimum of 0', () => {
    expect(clampOwned(-5, 10)).toBe(0);
    expect(clampOwned(-100, 10)).toBe(0);
  });

  it('allows zero', () => {
    expect(clampOwned(0, 10)).toBe(0);
  });

  it('allows values within range', () => {
    expect(clampOwned(5, 10)).toBe(5);
    expect(clampOwned(1, 10)).toBe(1);
  });

  it('enforces maximum of required', () => {
    expect(clampOwned(999, 10)).toBe(10);
    expect(clampOwned(11, 10)).toBe(10);
  });

  it('handles non-finite values', () => {
    expect(clampOwned(NaN, 10)).toBe(0);
    expect(clampOwned(Infinity, 10)).toBe(0);
    expect(clampOwned(-Infinity, 10)).toBe(0);
  });

  it('handles string inputs that can be converted to numbers', () => {
    expect(clampOwned('5' as unknown as number, 10)).toBe(5);
    expect(clampOwned('abc' as unknown as number, 10)).toBe(0);
  });

  it('handles required value of 0', () => {
    expect(clampOwned(5, 0)).toBe(0);
    expect(clampOwned(-5, 0)).toBe(0);
  });
});

describe('computeMissing', () => {
  it('returns full required when owned is 0', () => {
    expect(computeMissing(10, 0)).toBe(10);
    expect(computeMissing(5, 0)).toBe(5);
  });

  it('returns difference when owned is less than required', () => {
    expect(computeMissing(10, 5)).toBe(5);
    expect(computeMissing(10, 9)).toBe(1);
  });

  it('returns 0 when owned equals required', () => {
    expect(computeMissing(10, 10)).toBe(0);
    expect(computeMissing(1, 1)).toBe(0);
  });

  it('returns 0 when owned exceeds required (never negative)', () => {
    expect(computeMissing(10, 15)).toBe(0);
    expect(computeMissing(10, 100)).toBe(0);
  });

  it('handles edge case of 0 required', () => {
    expect(computeMissing(0, 0)).toBe(0);
    expect(computeMissing(0, 5)).toBe(0);
  });

  it('handles large numbers', () => {
    expect(computeMissing(1000, 500)).toBe(500);
    expect(computeMissing(10000, 9999)).toBe(1);
  });
});

describe('parseStudAreaFromName', () => {
  it('parses WxL patterns with "x" separator', () => {
    expect(parseStudAreaFromName('Plate 2 x 4')).toBe(8);
    expect(parseStudAreaFromName('Brick 2x4')).toBe(8);
    expect(parseStudAreaFromName('Tile 1x1 round')).toBe(1);
  });

  it('parses WxL patterns with "×" separator', () => {
    expect(parseStudAreaFromName('Brick 1×6')).toBe(6);
    expect(parseStudAreaFromName('Plate 4×4')).toBe(16);
  });

  it('parses dimensions with extra spaces', () => {
    expect(parseStudAreaFromName('Plate 2  x  4')).toBe(8);
    expect(parseStudAreaFromName('Tile  3 x 3')).toBe(9);
  });

  it('returns null for parts without dimensions', () => {
    expect(parseStudAreaFromName('Random Part')).toBeNull();
    expect(parseStudAreaFromName('Minifig Head')).toBeNull();
    expect(parseStudAreaFromName('Wheel Hub')).toBeNull();
  });

  it('returns null for empty strings', () => {
    expect(parseStudAreaFromName('')).toBeNull();
  });

  it('handles large dimensions', () => {
    expect(parseStudAreaFromName('Baseplate 32 x 32')).toBe(1024);
    expect(parseStudAreaFromName('Plate 16x16')).toBe(256);
  });

  it('handles 1x1 dimensions', () => {
    expect(parseStudAreaFromName('Tile 1x1')).toBe(1);
    expect(parseStudAreaFromName('Brick 1 x 1')).toBe(1);
  });

  it('extracts first dimension pattern when multiple exist', () => {
    expect(parseStudAreaFromName('Plate 2x4 with 1x2 Cutout')).toBe(8);
  });
});

describe('deriveCategory', () => {
  it('returns first alpha token', () => {
    expect(deriveCategory('Brick 2 x 4')).toBe('Brick');
    expect(deriveCategory('Plate, Modified 1x2')).toBe('Plate');
  });

  it('handles punctuation as separator', () => {
    expect(deriveCategory('Tile, Round 1x1')).toBe('Tile');
    expect(deriveCategory('Slope-Inverted')).toBe('Slope');
  });

  it('returns "Part" for whitespace-only strings', () => {
    expect(deriveCategory('   ')).toBe('Part');
    expect(deriveCategory('')).toBe('Part');
  });

  it('handles numbers at start', () => {
    expect(deriveCategory('2x4 Brick')).toBe('Part');
  });

  it('handles lowercase input', () => {
    expect(deriveCategory('brick 2x4')).toBe('brick');
  });

  it('handles mixed case', () => {
    expect(deriveCategory('BRICK 2x4')).toBe('BRICK');
    expect(deriveCategory('BrickArch')).toBe('BrickArch');
  });
});











