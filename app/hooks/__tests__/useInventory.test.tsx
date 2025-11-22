import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInventory } from '@/app/hooks/useInventory';
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
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useInventory', () => {
  it('computes totals and missing rows based on owned store', async () => {
    const { result, rerender } = renderHook(
      () => useInventory('1234-1'),
      { wrapper }
    );

    // initial: owned all zero
    await vi.waitFor(() => {
      expect(result.current.rows.length).toBe(2);
    });

    expect(result.current.totalRequired).toBe(6);
    expect(result.current.totalMissing).toBe(6);

    // mark some owned
    act(() => {
      useOwnedStore
        .getState()
        .setOwned('1234-1', '3001:1', 2);
    });
    rerender();

    expect(result.current.totalMissing).toBe(4);

    const missingRows = result.current.computeMissingRows();
    expect(missingRows).toHaveLength(2);
  });
});


