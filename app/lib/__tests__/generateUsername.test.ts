import { describe, expect, it } from 'vitest';

import {
  USERNAME_COLORS,
  USERNAME_PIECES,
  generateUsername,
} from '../generateUsername';

describe('generateUsername', () => {
  it('returns a lowercase string with no separators', () => {
    const name = generateUsername();
    expect(name).toMatch(/^[a-z0-9]+$/);
  });

  it('ends with exactly 4 digits', () => {
    const name = generateUsername();
    expect(name).toMatch(/\d{4}$/);
  });

  it('starts with a known color', () => {
    const name = generateUsername();
    expect(USERNAME_COLORS.some(c => name.startsWith(c))).toBe(true);
  });

  it('contains a known piece between the color and the 4-digit suffix', () => {
    const name = generateUsername();
    const withoutSuffix = name.slice(0, -4);
    const color = USERNAME_COLORS.find(c => withoutSuffix.startsWith(c));
    expect(color).toBeDefined();
    const piece = withoutSuffix.slice((color ?? '').length);
    expect(USERNAME_PIECES).toContain(
      piece as (typeof USERNAME_PIECES)[number]
    );
  });

  it('generates varied output across multiple calls', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateUsername()));
    // 16 colors × 5 pieces × 10000 suffixes = 800k combinations; 50 calls
    // should produce at least 40 unique.
    expect(names.size).toBeGreaterThanOrEqual(40);
  });

  it('fits within the username validation length (3-24 chars)', () => {
    for (let i = 0; i < 100; i++) {
      const name = generateUsername();
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(24);
    }
  });
});
