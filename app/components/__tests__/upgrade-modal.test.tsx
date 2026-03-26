import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UpgradeModal } from '../upgrade-modal';

// Mock next/link as a simple anchor
vi.mock('next/link', () => ({
  default: React.forwardRef(function MockLink(
    {
      href,
      children,
      ...rest
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
    ref: React.Ref<HTMLAnchorElement>
  ) {
    return React.createElement('a', { ...rest, href, ref }, children);
  }),
}));

// Mock the open-tabs store with 3 set tabs
vi.mock('@/app/store/open-tabs', () => {
  const tabs = [
    {
      type: 'set',
      id: '10497-1',
      setNumber: '10497-1',
      name: 'Galaxy Explorer',
      imageUrl: null,
      numParts: 1254,
      year: 2022,
    },
    {
      type: 'set',
      id: '75192-1',
      setNumber: '75192-1',
      name: 'Millennium Falcon',
      imageUrl: null,
      numParts: 7541,
      year: 2017,
    },
    {
      type: 'set',
      id: '42083-1',
      setNumber: '42083-1',
      name: 'Bugatti Chiron',
      imageUrl: null,
      numParts: 3599,
      year: 2018,
    },
  ];
  return {
    useOpenTabsStore: (
      selector: (s: {
        tabs: typeof tabs;
        closeTab: ReturnType<typeof vi.fn>;
      }) => unknown
    ) =>
      selector({
        tabs,
        closeTab: vi.fn(),
      }),
    isSetTab: (tab: { type: string }) => tab.type === 'set',
  };
});

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

  it('calls onClose when Maybe Later is clicked (non-tabs feature)', () => {
    const onClose = vi.fn();
    render(
      <UpgradeModal open={true} feature="rarity.enabled" onClose={onClose} />
    );
    fireEvent.click(screen.getByText(/maybe later/i));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows Continue button (disabled) for tabs.unlimited when at limit', () => {
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeTruthy();
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows open tabs list for tabs.unlimited feature', () => {
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    expect(screen.getByText('Open Tabs')).toBeTruthy();
    expect(screen.getByText('Galaxy Explorer')).toBeTruthy();
    expect(screen.getByText('Millennium Falcon')).toBeTruthy();
    expect(screen.getByText('Bugatti Chiron')).toBeTruthy();
  });

  it('shows close buttons for each tab', () => {
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    const closeBtns = screen.getAllByRole('button', { name: /close /i });
    expect(closeBtns).toHaveLength(3);
  });

  it('does not show open tabs list for non-tabs features', () => {
    render(
      <UpgradeModal open={true} feature="rarity.enabled" onClose={vi.fn()} />
    );
    expect(screen.queryByText(/open tabs/i)).toBeNull();
  });

  it('shows Maybe Later (not Continue) for non-tabs features', () => {
    render(
      <UpgradeModal open={true} feature="rarity.enabled" onClose={vi.fn()} />
    );
    expect(screen.getByText(/maybe later/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  });
});
