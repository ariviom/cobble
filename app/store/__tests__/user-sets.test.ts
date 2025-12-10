import { act } from '@testing-library/react';
import { type SetStatusKey, useUserSetsStore } from '@/app/store/user-sets';

function setStatus(setNumber: string, key: SetStatusKey, value: boolean): void {
  const setStatusFn = useUserSetsStore.getState().setStatus;
  act(() => {
    setStatusFn({
      setNumber,
      key,
      value,
      meta: {
        setNumber,
        name: setNumber,
        year: 0,
        imageUrl: null,
        numParts: 0,
      },
    });
  });
}

describe('useUserSetsStore', () => {
  const SET = '1234-1';

  beforeEach(() => {
    useUserSetsStore.setState({ sets: {} });
  });

  it('turns one status on at a time', () => {
    setStatus(SET, 'owned', true);
    let entry = useUserSetsStore.getState().sets['1234-1'];
    expect(entry?.status).toEqual({ owned: true, wantToBuild: false });

    setStatus(SET, 'wantToBuild', true);
    entry = useUserSetsStore.getState().sets['1234-1'];
    expect(entry?.status).toEqual({ owned: false, wantToBuild: true });
  });

  it('removes set when turning status off', () => {
    setStatus(SET, 'owned', true);
    expect(useUserSetsStore.getState().sets['1234-1']).toBeDefined();

    setStatus(SET, 'owned', false);
    expect(useUserSetsStore.getState().sets['1234-1']).toBeUndefined();
  });

  it('clearAllStatusesForSet removes the entry', () => {
    setStatus(SET, 'owned', true);
    act(() => {
      useUserSetsStore.getState().clearAllStatusesForSet(SET);
    });
    expect(useUserSetsStore.getState().sets['1234-1']).toBeUndefined();
  });
});
