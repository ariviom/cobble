'use client';

import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { FREE_TAB_LIMIT } from '@/app/lib/domain/limits';
import { isSetTab, useOpenTabsStore } from '@/app/store/open-tabs';
import { X } from 'lucide-react';

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
  /**
   * Optional Continue handler for gates that have a pending action to
   * commit on confirm (e.g. the tabs gate opens the originally-intended
   * set after the user frees up a slot). Defaults to `onClose` for gates
   * where Continue is just "Maybe Later".
   */
  onContinue?: () => void;
};

export function UpgradeModal({ open, feature, onClose, onContinue }: Props) {
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
                    <span className="mr-2 font-medium text-foreground">
                      {tab.setNumber}
                    </span>
                    {tab.name}
                  </span>
                  <button
                    onClick={() => closeTab(tab.id)}
                    className="shrink-0 rounded p-1 text-foreground-muted hover:bg-foreground/10 hover:text-foreground"
                    aria-label={`Close ${tab.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
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
          <Button
            variant="primary"
            href="/pricing"
            size="sm"
            className="flex-1"
          >
            Get Plus
          </Button>
          {feature === 'tabs.unlimited' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onContinue ?? onClose}
              disabled={setTabs.length >= FREE_TAB_LIMIT}
              className="flex-1"
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="flex-1"
            >
              Maybe Later
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
