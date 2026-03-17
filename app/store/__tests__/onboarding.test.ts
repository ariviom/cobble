import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, val),
  removeItem: (key: string) => storage.delete(key),
});

import { useOnboardingStore } from '../onboarding';

describe('onboarding store', () => {
  beforeEach(() => {
    storage.clear();
    useOnboardingStore.setState({
      completedSteps: [],
      dismissed: false,
      collapsed: false,
      _hydrated: false,
    });
  });

  it('starts with empty state', () => {
    const state = useOnboardingStore.getState();
    expect(state.completedSteps).toEqual([]);
    expect(state.dismissed).toBe(false);
    expect(state.collapsed).toBe(false);
  });

  it('completes a step', () => {
    useOnboardingStore.getState().complete('search_set');
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'search_set'
    );
  });

  it('does not duplicate completed steps', () => {
    useOnboardingStore.getState().complete('search_set');
    useOnboardingStore.getState().complete('search_set');
    const steps = useOnboardingStore.getState().completedSteps;
    expect(steps.filter(s => s === 'search_set')).toHaveLength(1);
  });

  it('auto-completes parent when trigger subtask completes', () => {
    useOnboardingStore.getState().complete('mark_piece_select');
    const steps = useOnboardingStore.getState().completedSteps;
    expect(steps).toContain('mark_piece_select');
    expect(steps).toContain('mark_piece');
  });

  it('dismisses the tour', () => {
    useOnboardingStore.getState().dismiss();
    expect(useOnboardingStore.getState().dismissed).toBe(true);
  });

  it('re-enables the tour', () => {
    useOnboardingStore.getState().dismiss();
    useOnboardingStore.getState().reEnable();
    expect(useOnboardingStore.getState().dismissed).toBe(false);
    expect(useOnboardingStore.getState().collapsed).toBe(false);
  });

  it('collapses and expands', () => {
    useOnboardingStore.getState().collapse();
    expect(useOnboardingStore.getState().collapsed).toBe(true);
    useOnboardingStore.getState().expand();
    expect(useOnboardingStore.getState().collapsed).toBe(false);
  });

  it('persists to localStorage on complete', () => {
    useOnboardingStore.getState().complete('search_set');
    const raw = storage.get('onboarding:progress');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.completedSteps).toContain('search_set');
  });

  it('hydrates from localStorage and sets _hydrated flag', () => {
    storage.set(
      'onboarding:progress',
      JSON.stringify({
        completedSteps: ['search_set', 'add_set'],
        dismissed: false,
      })
    );
    expect(useOnboardingStore.getState()._hydrated).toBe(false);
    useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState()._hydrated).toBe(true);
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'search_set'
    );
    expect(useOnboardingStore.getState().completedSteps).toContain('add_set');
  });

  it('hydrates per-user key when userId provided', () => {
    storage.set(
      'onboarding:progress:user-123',
      JSON.stringify({
        completedSteps: ['identify_part'],
        dismissed: false,
      })
    );
    useOnboardingStore.getState().hydrate('user-123');
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'identify_part'
    );
  });

  it('computes isComplete when all top-level items are done', () => {
    const { complete } = useOnboardingStore.getState();
    complete('search_set');
    complete('add_set');
    complete('identify_part');
    complete('mark_piece_select'); // triggers mark_piece
    complete('start_search_party');
    complete('review_settings');
    expect(useOnboardingStore.getState().isComplete()).toBe(true);
  });

  it('computes progress fraction', () => {
    useOnboardingStore.getState().complete('search_set');
    const { completed, total } = useOnboardingStore.getState().progress();
    expect(completed).toBe(1);
    expect(total).toBe(6);
  });

  it('resets anonymous dismissal when hydrating a new authenticated user', () => {
    // Simulate anonymous dismissal
    useOnboardingStore.getState().hydrate();
    useOnboardingStore.getState().dismiss();
    expect(useOnboardingStore.getState().dismissed).toBe(true);

    // Hydrate with a userId that has no stored state (new account)
    useOnboardingStore.getState().hydrate('new-user-456');
    expect(useOnboardingStore.getState().dismissed).toBe(false);
  });

  it('preserves authenticated dismissal when hydrating with stored state', () => {
    storage.set(
      'onboarding:progress:user-789',
      JSON.stringify({
        completedSteps: ['search_set'],
        dismissed: true,
      })
    );
    useOnboardingStore.getState().hydrate('user-789');
    expect(useOnboardingStore.getState().dismissed).toBe(true);
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'search_set'
    );
  });
});
