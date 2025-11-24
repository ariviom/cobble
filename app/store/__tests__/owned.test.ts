import { act } from '@testing-library/react';
import { useOwnedStore } from '@/app/store/owned';

describe('useOwnedStore', () => {
  it('defaults owned quantity to 0 and can set values', () => {
    const setNumber = '1234-1';
    const key = '3001:1';

    const initial = useOwnedStore.getState();
    expect(initial.getOwned(setNumber, key)).toBe(0);

    act(() => {
      useOwnedStore.getState().setOwned(setNumber, key, 3);
    });

    const next = useOwnedStore.getState();
    expect(next.getOwned(setNumber, key)).toBe(3);
  });
});




