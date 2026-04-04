import { describe, expect, it } from 'vitest';

import { generateUsername } from '../generateUsername';

describe('generateUsername', () => {
  it('returns a lowercase string with no separators', () => {
    const name = generateUsername();
    expect(name).toMatch(/^[a-z0-9]+$/);
  });

  it('ends with exactly 4 digits', () => {
    const name = generateUsername();
    expect(name).toMatch(/\d{4}$/);
  });

  it('starts with a known first word', () => {
    const validPrefixes = ['brick', 'set', 'stud', 'part', 'piece'];
    const name = generateUsername();
    expect(validPrefixes.some(p => name.startsWith(p))).toBe(true);
  });

  it('contains a known second word', () => {
    const secondWords = [
      'builder',
      'sorter',
      'stacker',
      'collector',
      'maniac',
      'fan',
      'nerd',
      'vault',
      'stash',
      'haul',
      'finder',
    ];
    const name = generateUsername();
    // Strip the 4-digit suffix, then check the remainder contains a second word
    const withoutSuffix = name.slice(0, -4);
    expect(secondWords.some(w => withoutSuffix.endsWith(w))).toBe(true);
  });

  it('generates varied output across multiple calls', () => {
    const names = new Set(Array.from({ length: 50 }, () => generateUsername()));
    // With ~46 pairs × 10000 suffixes, 50 calls should produce at least 40 unique
    expect(names.size).toBeGreaterThanOrEqual(40);
  });

  it('fits within the username validation length (3-24 chars)', () => {
    // Run many times to cover different combos
    for (let i = 0; i < 100; i++) {
      const name = generateUsername();
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(24);
    }
  });

  it('does not pair narrow first words with identity second words', () => {
    const narrowFirst = ['stud', 'part', 'piece'];
    const identityOnly = ['maniac', 'fan', 'nerd'];

    // Generate many usernames and check the constraint
    for (let i = 0; i < 200; i++) {
      const name = generateUsername();
      const withoutSuffix = name.slice(0, -4);
      const isNarrowFirst = narrowFirst.some(p => withoutSuffix.startsWith(p));
      if (isNarrowFirst) {
        const afterFirst =
          narrowFirst.find(p => withoutSuffix.startsWith(p)) ?? '';
        const secondWord = withoutSuffix.slice(afterFirst.length);
        expect(identityOnly).not.toContain(secondWord);
      }
    }
  });
});
