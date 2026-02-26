import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UpgradeModal } from '../upgrade-modal';

describe('UpgradeModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <UpgradeModal open={false} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows feature-specific message when open', () => {
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    expect(screen.getByText(/free limit of 3 open tabs/i)).toBeTruthy();
    expect(screen.getByText(/upgrade to plus/i)).toBeTruthy();
  });

  it('renders View Plans link to /pricing', () => {
    render(
      <UpgradeModal open={true} feature="rarity.enabled" onClose={vi.fn()} />
    );
    const link = screen.getByRole('link', { name: /view plans/i });
    expect(link.getAttribute('href')).toBe('/pricing');
  });

  it('calls onClose when Maybe Later is clicked', () => {
    const onClose = vi.fn();
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={onClose} />
    );
    fireEvent.click(screen.getByText(/maybe later/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
