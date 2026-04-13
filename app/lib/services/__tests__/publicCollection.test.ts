import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { fetchPublicCollectionPayload } from '@/app/lib/services/publicCollection';

function emptyChain() {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  for (const key of ['select', 'eq', 'in', 'order', 'limit']) {
    (chain as Record<string, unknown>)[key] = vi.fn(noop);
  }
  // Make the chain awaitable, resolving to an empty result.
  (chain as Record<string, unknown>).then = (
    resolve: (v: { data: unknown[]; error: null }) => void
  ) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}

function makeClient() {
  return { from: vi.fn(() => emptyChain()) } as never;
}

describe('fetchPublicCollectionPayload', () => {
  it('returns empty arrays when the user has no data', async () => {
    const supabase = makeClient();
    const catalogClient = makeClient();

    const result = await fetchPublicCollectionPayload('u1', {
      supabase,
      catalogClient,
    });

    expect(result).toEqual({
      allSets: [],
      allMinifigs: [],
      allParts: [],
      lists: [],
    });
  });
});
