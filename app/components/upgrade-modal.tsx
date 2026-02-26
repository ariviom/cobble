'use client';

import React from 'react';
import Link from 'next/link';

import { Modal } from '@/app/components/ui/Modal';

export type FeatureGateKey =
  | 'tabs.unlimited'
  | 'lists.unlimited'
  | 'identify.unlimited'
  | 'search_party.unlimited'
  | 'rarity.enabled'
  | 'sync.cloud';

const GATE_MESSAGES: Record<FeatureGateKey, string> = {
  'tabs.unlimited': "You've reached the free limit of 3 open tabs.",
  'lists.unlimited': "You've reached the free limit of 5 lists.",
  'identify.unlimited': "You've used all your free identifications for today.",
  'search_party.unlimited':
    "You've used your free Search Party sessions for this month.",
  'rarity.enabled': 'Part rarity insights are a Plus feature.',
  'sync.cloud': 'Cloud sync is a Plus feature.',
};

const PLUS_BENEFITS = [
  'Unlimited tabs, lists, and identifications',
  'Part rarity insights',
  'Cloud sync across devices',
  'Unlimited Search Party sessions',
];

type Props = {
  open: boolean;
  feature: FeatureGateKey;
  onClose: () => void;
};

export function UpgradeModal({ open, feature, onClose }: Props) {
  return (
    <Modal open={open} title="Upgrade to Plus" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-foreground-muted">{GATE_MESSAGES[feature]}</p>
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
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-subtle px-4 py-2 text-center text-sm font-medium text-foreground-muted hover:bg-card-muted"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </Modal>
  );
}
