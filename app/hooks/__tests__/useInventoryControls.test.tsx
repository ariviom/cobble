import { renderHook, act } from '@testing-library/react';
import { useInventoryControls } from '@/app/hooks/useInventoryControls';

describe('useInventoryControls', () => {
  it('initializes with default values', () => {
    const { result } = renderHook(() => useInventoryControls());

    expect(result.current.sortKey).toBe('color');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.view).toBe('list');
    expect(result.current.itemSize).toBe('md');
    expect(result.current.groupBy).toBe('none');
    expect(result.current.filter.display).toBe('all');
  });

  it('updates sort key and persists display filter', () => {
    const { result } = renderHook(() => useInventoryControls());

    act(() => {
      result.current.setSortKey('name');
      result.current.setFilter({
        ...result.current.filter,
        display: 'missing',
        parents: [],
        subcategoriesByParent: {},
        colors: [],
      });
    });

    expect(result.current.sortKey).toBe('name');
    expect(result.current.filter.display).toBe('missing');
  });
});




