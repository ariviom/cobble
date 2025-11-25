import { act } from '@testing-library/react';
import { usePinnedStore } from '@/app/store/pinned';

describe('usePinnedStore', () => {
  const SET = '1234-1';
  const KEY = '3001:1';

  beforeEach(() => {
    usePinnedStore.setState({
      pinned: {},
      meta: {},
      autoUnpin: false,
      showOtherSets: false,
    });
  });

  it('toggles pinned state and maintains meta', () => {
    act(() => {
      usePinnedStore.getState().togglePinned({
        setNumber: SET,
        key: KEY,
        setName: 'Test Set',
      });
    });

    expect(usePinnedStore.getState().isPinned(SET, KEY)).toBe(true);
    expect(usePinnedStore.getState().getMetaForSet(SET)?.setName).toBe(
      'Test Set'
    );

    act(() => {
      usePinnedStore.getState().togglePinned({ setNumber: SET, key: KEY });
    });

    expect(usePinnedStore.getState().isPinned(SET, KEY)).toBe(false);
  });

  it('setPinned pins and unpins directly', () => {
    act(() => {
      usePinnedStore.getState().setPinned(SET, KEY, true, 'Pinned Set');
    });
    expect(usePinnedStore.getState().isPinned(SET, KEY)).toBe(true);

    act(() => {
      usePinnedStore.getState().setPinned(SET, KEY, false);
    });
    expect(usePinnedStore.getState().isPinned(SET, KEY)).toBe(false);
  });
});










