import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInventoryViewModel } from '@/app/hooks/useInventoryViewModel';
import { useOwnedStore } from '@/app/store/owned';
import type { InventoryRow } from '@/app/components/set/types';

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

global.fetch = vi.fn(async () => {
  return {
    ok: true,
    json: async () => ({ rows: mockRows }),
  } as Response;
}) as unknown as typeof fetch;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useInventoryViewModel', () => {
  it('derives visible indices and color options', async () => {
    const { result } = renderHook(
      () => useInventoryViewModel('1234-1'),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(result.current.rows.length).toBe(2);
    });

    expect(result.current.visibleIndices).toEqual([0, 1]);
    expect(result.current.colorOptions).toEqual(['Blue', 'Red']);
  });

  it('respects display filter based on owned quantities', async () => {
    const { result, rerender } = renderHook(
      () => useInventoryViewModel('1234-1'),
      { wrapper }
    );

    await vi.waitFor(() => {
      expect(result.current.rows.length).toBe(2);
    });

    // Mark first row fully owned
    act(() => {
      useOwnedStore
        .getState()
        .setOwned('1234-1', '3001:1', 4);
    });
    rerender();

    // Switch to "missing" display
    act(() => {
      result.current.setFilter({
        ...result.current.filter,
        display: 'missing',
      });
    });
    rerender();

    // Only the second row should be visible when filtering by missing
    expect(result.current.visibleIndices).toEqual([1]);
  });
});

