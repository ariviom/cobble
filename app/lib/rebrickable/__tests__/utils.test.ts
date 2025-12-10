import { describe, expect, it } from 'vitest';

import { extractBricklinkPartId } from '../utils';

describe('extractBricklinkPartId', () => {
  it('returns null for nullish input', () => {
    expect(extractBricklinkPartId(null)).toBeNull();
    expect(extractBricklinkPartId(undefined)).toBeNull();
  });

  it('extracts from array format', () => {
    expect(extractBricklinkPartId({ BrickLink: ['3001'] })).toBe('3001');
  });

  it('extracts from ext_ids nested format', () => {
    expect(extractBricklinkPartId({ BrickLink: { ext_ids: [12345] } })).toBe(
      '12345'
    );
  });

  it('handles numeric values and coerces to string', () => {
    expect(extractBricklinkPartId({ BrickLink: [99999] })).toBe('99999');
  });

  it('returns null when no usable id present', () => {
    expect(extractBricklinkPartId({ BrickLink: [] })).toBeNull();
    expect(extractBricklinkPartId({ BrickLink: { ext_ids: [] } })).toBeNull();
    expect(extractBricklinkPartId({ BrickLink: { ext_ids: [{}] } })).toBeNull();
  });
});
