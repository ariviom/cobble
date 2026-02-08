import { parseInventoryKey } from '@/app/lib/ownedSync';
import { vi } from 'vitest';

vi.mock('@/app/lib/localDb', () => ({
  enqueueOwnedChange: vi.fn(),
  isIndexedDBAvailable: vi.fn(() => false),
}));

describe('parseInventoryKey', () => {
  it('parses standard key', () => {
    expect(parseInventoryKey('3001:1')).toEqual({
      partNum: '3001',
      colorId: 1,
      isSpare: false,
    });
  });

  it('returns null for fig keys', () => {
    expect(parseInventoryKey('fig:sw0001')).toBeNull();
  });

  it('returns null for parent relation keys', () => {
    expect(parseInventoryKey('3001:1:parent=fig:sw0001')).toBeNull();
  });

  it('handles bl: prefixed keys (unmatched subparts)', () => {
    expect(parseInventoryKey('bl:973pb1234:11')).toEqual({
      partNum: '973pb1234',
      colorId: 11,
      isSpare: false,
    });
  });

  it('handles bl: prefix with colons in part ID', () => {
    expect(parseInventoryKey('bl:some:part:5')).toEqual({
      partNum: 'some:part',
      colorId: 5,
      isSpare: false,
    });
  });

  it('returns null for bl: with no color', () => {
    expect(parseInventoryKey('bl:partonly')).toBeNull();
  });

  it('returns null for bl: with invalid color', () => {
    expect(parseInventoryKey('bl:part:abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseInventoryKey('')).toBeNull();
  });

  it('returns null for key without colon', () => {
    expect(parseInventoryKey('3001')).toBeNull();
  });
});
