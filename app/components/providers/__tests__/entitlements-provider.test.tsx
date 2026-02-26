import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  EntitlementsProvider,
  useEntitlements,
} from '../entitlements-provider';

function TestConsumer() {
  const ent = useEntitlements();
  return (
    <div>
      <span data-testid="tier">{ent.tier}</span>
      <span data-testid="isPlus">{String(ent.isPlus)}</span>
      <span data-testid="hasTabs">
        {String(ent.hasFeature('tabs.unlimited'))}
      </span>
    </div>
  );
}

describe('EntitlementsProvider', () => {
  it('defaults to free tier when initialEntitlements is null', () => {
    render(
      <EntitlementsProvider initialEntitlements={null}>
        <TestConsumer />
      </EntitlementsProvider>
    );
    expect(screen.getByTestId('tier').textContent).toBe('free');
    expect(screen.getByTestId('isPlus').textContent).toBe('false');
    expect(screen.getByTestId('hasTabs').textContent).toBe('false');
  });

  it('exposes Plus entitlements when provided', () => {
    const plusEntitlements = {
      tier: 'plus' as const,
      features: ['tabs.unlimited', 'lists.unlimited', 'rarity.enabled'],
      featureFlagsByKey: {},
    };
    render(
      <EntitlementsProvider initialEntitlements={plusEntitlements}>
        <TestConsumer />
      </EntitlementsProvider>
    );
    expect(screen.getByTestId('tier').textContent).toBe('plus');
    expect(screen.getByTestId('isPlus').textContent).toBe('true');
    expect(screen.getByTestId('hasTabs').textContent).toBe('true');
  });

  it('throws when useEntitlements is used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useEntitlements must be used within an EntitlementsProvider'
    );
    spy.mockRestore();
  });
});
