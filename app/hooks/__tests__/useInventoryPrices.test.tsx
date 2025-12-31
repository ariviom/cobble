import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { InventoryRow } from '@/app/components/set/types';
import {
  type BasePriceInfo,
  useInventoryPrices,
} from '@/app/hooks/useInventoryPrices';

vi.mock('@/app/lib/supabaseClient', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: null,
      }),
    },
  }),
}));

const mockRows: InventoryRow[] = [
  {
    setNumber: '1234-1',
    partId: '3001',
    partName: 'Brick 2 x 4',
    colorId: 1,
    colorName: 'Red',
    quantityRequired: 4,
    imageUrl: null,
    inventoryKey: '3001:1',
  },
  {
    setNumber: '1234-1',
    partId: '3002',
    partName: 'Plate 2 x 2',
    colorId: 2,
    colorName: 'Blue',
    quantityRequired: 2,
    imageUrl: null,
    inventoryKey: '3002:2',
  },
];

describe('useInventoryPrices', () => {
  it('does not fetch prices until explicitly requested and only for requested keys', async () => {
    let lastRequestBody: unknown = null;

    global.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(init.body as string) as { items: Array<{ key: string }> })
        : null;
      lastRequestBody = body;

      const prices: Record<string, BasePriceInfo> = {};
      if (body) {
        for (const item of body.items) {
          prices[item.key] = {
            unitPrice: 0.5,
            minPrice: 0.4,
            maxPrice: 0.6,
            currency: 'USD',
          };
        }
      }

      return {
        ok: true,
        json: async () => ({ prices }),
      } as Response;
    }) as unknown as typeof fetch;

    const keys = mockRows.map(row => row.inventoryKey);

    const { result } = renderHook(() =>
      useInventoryPrices<BasePriceInfo>({
        setNumber: '1234-1',
        rows: mockRows,
        keys,
      })
    );

    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.requestPricesForKeys([keys[0]!]);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(lastRequestBody).not.toBeNull();

    const parsed = lastRequestBody as { items: Array<{ key: string }> };
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.key).toBe(keys[0]);

    await vi.waitFor(() => {
      expect(result.current.pricesByKey[keys[0]!]?.unitPrice).toBe(0.5);
      expect(result.current.pricesStatus).toBe('loaded');
    });

    expect(result.current.pendingKeys.has(keys[0]!)).toBe(false);
  });

  it('does not re-fetch prices for keys that already have data', async () => {
    global.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(init.body as string) as { items: Array<{ key: string }> })
        : null;

      const prices: Record<string, BasePriceInfo> = {};
      if (body) {
        for (const item of body.items) {
          prices[item.key] = {
            unitPrice: 1.0,
            minPrice: 0.9,
            maxPrice: 1.1,
            currency: 'USD',
          };
        }
      }

      return {
        ok: true,
        json: async () => ({ prices }),
      } as Response;
    }) as unknown as typeof fetch;

    const keys = mockRows.map(row => row.inventoryKey);

    const { result } = renderHook(() =>
      useInventoryPrices<BasePriceInfo>({
        setNumber: '1234-1',
        rows: mockRows,
        keys,
      })
    );

    await act(async () => {
      await result.current.requestPricesForKeys([keys[0]!]);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(result.current.pricesByKey[keys[0]!]?.unitPrice).toBe(1.0);
    });

    await act(async () => {
      await result.current.requestPricesForKeys([keys[0]!]);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
