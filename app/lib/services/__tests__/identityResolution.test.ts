import type { InventoryRow } from '@/app/components/set/types';
import type { ResolutionContext } from '../identityResolution';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveCatalogPartIdentity } from '../identityResolution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    setNumber: '6097-1',
    partId: '3001',
    partName: 'Brick 2x4',
    colorId: 1,
    colorName: 'Blue',
    quantityRequired: 4,
    imageUrl: null,
    inventoryKey: '3001:1',
    ...overrides,
  };
}

function makeCtx(
  overrides: Partial<ResolutionContext> = {}
): ResolutionContext {
  return {
    rbToBlColor: new Map(),
    blToRbColor: new Map(),
    partMappings: new Map(),
    blToRbPart: new Map(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveCatalogPartIdentity', () => {
  it('defaults blPartId to rbPartId when no explicit mapping exists', () => {
    const row = makeRow({ partId: '3001' });
    const ctx = makeCtx(); // no mappings

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.blPartId).toBe('3001');
    expect(identity.rbPartId).toBe('3001');
  });

  it('uses explicit bricklinkPartId from row when available', () => {
    const row = makeRow({ partId: '3957a', bricklinkPartId: '3957' });
    const ctx = makeCtx();

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.blPartId).toBe('3957');
    expect(identity.rbPartId).toBe('3957a');
  });

  it('uses partMappings override over same-by-default', () => {
    const row = makeRow({ partId: '3957a' });
    const ctx = makeCtx({
      partMappings: new Map([['3957a', '3957']]),
    });

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.blPartId).toBe('3957');
  });

  it('prefers bricklinkPartId over partMappings override', () => {
    const row = makeRow({
      partId: '3957a',
      bricklinkPartId: '3957-explicit',
    });
    const ctx = makeCtx({
      partMappings: new Map([['3957a', '3957-from-mapping']]),
    });

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.blPartId).toBe('3957-explicit');
  });

  it('keeps blColorId null when no color mapping exists (NOT same-by-default)', () => {
    const row = makeRow({ colorId: 0 }); // RB Black = 0
    const ctx = makeCtx(); // no color mapping

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.blColorId).toBeNull();
  });

  it('maps blColorId when color mapping exists', () => {
    const row = makeRow({ colorId: 0 }); // RB Black = 0
    const ctx = makeCtx({
      rbToBlColor: new Map([[0, 11]]), // BL Black = 11
    });

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.blColorId).toBe(11);
  });

  it('sets elementId from row when available', () => {
    const row = makeRow({ elementId: '300121' });
    const ctx = makeCtx();

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.elementId).toBe('300121');
  });

  it('produces correct canonicalKey', () => {
    const row = makeRow({ partId: '3001', colorId: 1 });
    const ctx = makeCtx();

    const identity = resolveCatalogPartIdentity(row, ctx);

    expect(identity.canonicalKey).toBe('3001:1');
    expect(identity.rowType).toBe('catalog_part');
  });
});
