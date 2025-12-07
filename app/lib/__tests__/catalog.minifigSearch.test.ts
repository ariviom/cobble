import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { MinifigCatalogResult } from '@/app/lib/catalog';

vi.mock('server-only', () => ({}));

let sortMinifigResults: typeof import('@/app/lib/catalog')['sortMinifigResults'];

beforeAll(async () => {
	({ sortMinifigResults } = await import('@/app/lib/catalog'));
});

function makeResult(
  overrides: Partial<MinifigCatalogResult>
): MinifigCatalogResult {
  return {
    figNum: 'fig-000',
    name: 'Placeholder',
    imageUrl: null,
    numParts: null,
    matchSource: 'name',
    ...overrides,
  };
}

describe('sortMinifigResults', () => {
  it('prioritizes BrickLink matches when the query looks like a BL ID', () => {
    const items: MinifigCatalogResult[] = [
      makeResult({
        figNum: 'cas432',
        name: 'BL Match',
        matchSource: 'bricklink-id',
      }),
      makeResult({
        figNum: 'cas001',
        name: 'Theme Result',
        matchSource: 'theme',
      }),
    ];

    const sorted = sortMinifigResults(items, 'relevance', 'cas432');
    expect(sorted[0]?.figNum).toBe('cas432');
  });

  it('continues to prefer name matches for non-ID queries', () => {
    const items: MinifigCatalogResult[] = [
      makeResult({
        figNum: 'alpha01',
        name: 'Alpha Trooper',
        matchSource: 'name',
      }),
      makeResult({
        figNum: 'beta02',
        name: 'Beta Trooper',
        matchSource: 'theme',
      }),
    ];

    const sorted = sortMinifigResults(items, 'relevance', 'alpha');
    expect(sorted[0]?.figNum).toBe('alpha01');
  });
});
