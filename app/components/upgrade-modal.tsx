'use client';

import React from 'react';
import Link from 'next/link';

import { Modal } from '@/app/components/ui/Modal';
import { useOpenTabsStore, isSetTab } from '@/app/store/open-tabs';
import { FREE_TAB_LIMIT } from '@/app/lib/domain/limits';

export type FeatureGateKey =
  | 'tabs.unlimited'
  | 'lists.unlimited'
  | 'identify.unlimited'
  | 'search_party.unlimited'
  | 'rarity.enabled'
  | 'sync.cloud'
  | 'list_builder.enabled';

const GATE_MESSAGES: Record<FeatureGateKey, string> = {
  'tabs.unlimited': "You've reached the free limit of 3 open tabs.",
  'lists.unlimited': "You've reached the free limit of 5 lists.",
  'identify.unlimited': "You've used all your free identifications for today.",
  'search_party.unlimited':
    "You've used your free Search Party sessions for this month.",
  'rarity.enabled': 'Part rarity insights are a Plus feature.',
  'sync.cloud': 'Cloud sync is a Plus feature.',
  'list_builder.enabled':
    'Build custom parts lists for targeted purchasing across your collection.',
};

const PLUS_BENEFITS = [
  'Unlimited tabs, lists, and identifications',
  'Part rarity insights',
  'Cloud sync across devices',
  'Unlimited Search Party sessions',
  'Custom parts list builder',
];

type Props = {
  open: boolean;
  feature: FeatureGateKey;
  onClose: () => void;
};

export function UpgradeModal({ open, feature, onClose }: Props) {
  const tabs = useOpenTabsStore(s => s.tabs);
  const closeTab = useOpenTabsStore(s => s.closeTab);
  const setTabs = feature === 'tabs.unlimited' ? tabs.filter(isSetTab) : [];

  return (
    <Modal open={open} title="Upgrade to Plus" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-foreground-muted">{GATE_MESSAGES[feature]}</p>
        {feature === 'tabs.unlimited' && setTabs.length > 0 && (
          <div className="rounded-lg border border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-foreground-muted uppercase">
              Open Tabs
            </p>
            <ul className="space-y-1">
              {setTabs.map(tab => (
                <li
                  key={tab.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="truncate text-foreground-muted">
                    <span className="font-medium text-foreground">
                      {tab.setNumber}
                    </span>{' '}
                    {tab.name}
                  </span>
                  <button
                    onClick={() => closeTab(tab.id)}
                    className="shrink-0 rounded p-1 text-foreground-muted hover:bg-foreground/10 hover:text-foreground"
                    aria-label={`Close ${tab.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-lg border border-subtle bg-card-muted p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Plus includes:
          </p>
          <ul className="space-y-1 text-sm text-foreground-muted">
            {PLUS_BENEFITS.map(b => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-0.5 text-success">&#10003;</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-3">
          <Link
            href="/pricing"
            className="flex-1 rounded-lg bg-theme-primary px-4 py-2 text-center text-sm font-medium text-theme-primary-contrast hover:opacity-90"
          >
            View Plans
          </Link>
          {feature === 'tabs.unlimited' ? (
            <button
              onClick={onClose}
              disabled={setTabs.length >= FREE_TAB_LIMIT}
              className="flex-1 rounded-lg border border-subtle px-4 py-2 text-center text-sm font-medium text-foreground-muted hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-subtle px-4 py-2 text-center text-sm font-medium text-foreground-muted hover:bg-card-muted"
            >
              Maybe Later
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
