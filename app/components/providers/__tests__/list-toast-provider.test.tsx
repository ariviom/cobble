import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ListToastProvider,
  emitListToast,
} from '@/app/components/providers/list-toast-provider';

describe('ListToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a toast when emitListToast is called', () => {
    render(
      <ListToastProvider>
        <div>child</div>
      </ListToastProvider>
    );

    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      emitListToast('Something went wrong');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('auto-dismisses the toast after 4 seconds', () => {
    render(
      <ListToastProvider>
        <div>child</div>
      </ListToastProvider>
    );

    act(() => {
      emitListToast('Ephemeral');
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retriggers auto-dismiss when a second emit arrives', () => {
    render(
      <ListToastProvider>
        <div>child</div>
      </ListToastProvider>
    );

    act(() => {
      emitListToast('First');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      emitListToast('Second');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Second');

    // 2s after the *second* emit is not yet 4s — still visible
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Second');

    // 4s after the second emit — gone
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is a no-op when emitListToast is called with no provider mounted', () => {
    expect(() => emitListToast('no listeners')).not.toThrow();
  });
});
