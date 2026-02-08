import {
  createCatalogPartIdentity,
  createMatchedSubpartIdentity,
  createMinifigParentIdentity,
  createUnmatchedSubpartIdentity,
  getLegacyKeys,
  parseCanonicalKey,
} from '@/app/lib/domain/partIdentity';

describe('PartIdentity factories', () => {
  describe('createCatalogPartIdentity', () => {
    it('creates identity with RB-based canonical key', () => {
      const id = createCatalogPartIdentity('3001', 1, 'BL-3001', 11, '123456');
      expect(id.canonicalKey).toBe('3001:1');
      expect(id.rbPartId).toBe('3001');
      expect(id.rbColorId).toBe(1);
      expect(id.blPartId).toBe('BL-3001');
      expect(id.blColorId).toBe(11);
      expect(id.elementId).toBe('123456');
      expect(id.rowType).toBe('catalog_part');
      expect(id.blMinifigId).toBeNull();
    });

    it('handles null BL IDs', () => {
      const id = createCatalogPartIdentity('3001', 1, null, null, null);
      expect(id.canonicalKey).toBe('3001:1');
      expect(id.blPartId).toBeNull();
      expect(id.blColorId).toBeNull();
    });
  });

  describe('createMinifigParentIdentity', () => {
    it('creates identity with fig: prefixed key', () => {
      const id = createMinifigParentIdentity('sw0001');
      expect(id.canonicalKey).toBe('fig:sw0001');
      expect(id.rbPartId).toBe('fig:sw0001');
      expect(id.rbColorId).toBe(0);
      expect(id.rowType).toBe('minifig_parent');
      expect(id.blMinifigId).toBe('sw0001');
    });
  });

  describe('createMatchedSubpartIdentity', () => {
    it('uses RB IDs for canonical key', () => {
      const id = createMatchedSubpartIdentity('3626c', 0, '3626bp01', 11);
      expect(id.canonicalKey).toBe('3626c:0');
      expect(id.rbPartId).toBe('3626c');
      expect(id.rbColorId).toBe(0);
      expect(id.blPartId).toBe('3626bp01');
      expect(id.blColorId).toBe(11);
      expect(id.rowType).toBe('minifig_subpart_matched');
    });
  });

  describe('createUnmatchedSubpartIdentity', () => {
    it('uses bl: prefix for canonical key', () => {
      const id = createUnmatchedSubpartIdentity('973pb1234', 11);
      expect(id.canonicalKey).toBe('bl:973pb1234:11');
      expect(id.rbPartId).toBe('973pb1234');
      expect(id.rbColorId).toBe(11);
      expect(id.blPartId).toBe('973pb1234');
      expect(id.blColorId).toBe(11);
      expect(id.rowType).toBe('minifig_subpart_unmatched');
    });
  });
});

describe('getLegacyKeys', () => {
  it('returns canonical + BL key for matched subparts', () => {
    const id = createMatchedSubpartIdentity('3626c', 0, '3626bp01', 11);
    const keys = getLegacyKeys(id);
    expect(keys).toContain('3626c:0'); // canonical (RB)
    expect(keys).toContain('3626bp01:11'); // legacy BL key
  });

  it('returns canonical + unprefixed BL key for unmatched subparts', () => {
    const id = createUnmatchedSubpartIdentity('973pb1234', 11);
    const keys = getLegacyKeys(id);
    expect(keys).toContain('bl:973pb1234:11'); // canonical
    expect(keys).toContain('973pb1234:11'); // legacy unprefixed BL key
  });

  it('returns only canonical key for minifig parents', () => {
    const id = createMinifigParentIdentity('sw0001');
    const keys = getLegacyKeys(id);
    expect(keys).toEqual(['fig:sw0001']);
  });

  it('returns canonical + BL key for catalog parts with BL IDs', () => {
    const id = createCatalogPartIdentity('3001', 1, 'BL-3001', 11, null);
    const keys = getLegacyKeys(id);
    expect(keys).toContain('3001:1');
    expect(keys).toContain('BL-3001:11');
  });

  it('returns only canonical for catalog parts without BL IDs', () => {
    const id = createCatalogPartIdentity('3001', 1, null, null, null);
    const keys = getLegacyKeys(id);
    expect(keys).toEqual(['3001:1']);
  });

  it('deduplicates keys when BL matches RB', () => {
    // When BL part ID and RB part ID are the same, and color IDs also happen to match
    const id = createMatchedSubpartIdentity('3001', 11, '3001', 11);
    const keys = getLegacyKeys(id);
    // Should deduplicate since canonical and BL key are the same
    expect(keys).toEqual(['3001:11']);
  });
});

describe('parseCanonicalKey', () => {
  it('parses standard RB key', () => {
    const result = parseCanonicalKey('3001:1');
    expect(result).toEqual({ partNum: '3001', colorId: 1, system: 'rb' });
  });

  it('parses fig key', () => {
    const result = parseCanonicalKey('fig:sw0001');
    expect(result).toEqual({ partNum: 'sw0001', colorId: 0, system: 'fig' });
  });

  it('parses bl: prefixed key', () => {
    const result = parseCanonicalKey('bl:973pb1234:11');
    expect(result).toEqual({
      partNum: '973pb1234',
      colorId: 11,
      system: 'bl',
    });
  });

  it('handles part IDs containing colons', () => {
    // BL parts can have IDs like "3626bp01" — no colons, but test edge case
    const result = parseCanonicalKey('bl:part:with:colons:5');
    expect(result).toEqual({
      partNum: 'part:with:colons',
      colorId: 5,
      system: 'bl',
    });
  });

  it('returns null for empty string', () => {
    expect(parseCanonicalKey('')).toBeNull();
  });

  it('returns null for key without colon', () => {
    expect(parseCanonicalKey('3001')).toBeNull();
  });

  it('returns null for invalid color ID', () => {
    expect(parseCanonicalKey('3001:abc')).toBeNull();
  });

  it('returns null for empty fig ID', () => {
    expect(parseCanonicalKey('fig:')).toBeNull();
  });

  it('returns null for bl: with no valid color', () => {
    expect(parseCanonicalKey('bl:partonly')).toBeNull();
  });
});
