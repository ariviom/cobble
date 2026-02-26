'use client';

import { useCallback, useState } from 'react';

import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import type { FeatureGateKey } from '@/app/components/upgrade-modal';
import { useOpenTabsStore, isSetTab, type SetTab } from '@/app/store/open-tabs';

const FREE_TAB_LIMIT = 3;

/**
 * Wraps the open-tabs store actions with a free-tier tab limit check.
 *
 * - `openTab` gates NEW set tabs (existing tab switches are always allowed).
 * - `replaceLandingWithSet` gates when the replacement would exceed the limit.
 * - Landing tabs are never gated — they carry no inventory.
 *
 * Returns modal state so the calling component can render an UpgradeModal.
 */
export function useGatedOpenTab() {
  const { hasFeature } = useEntitlements();
  const tabs = useOpenTabsStore(s => s.tabs);
  const storeOpenTab = useOpenTabsStore(s => s.openTab);
  const storeReplaceLandingWithSet = useOpenTabsStore(
    s => s.replaceLandingWithSet
  );
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const setTabCount = tabs.filter(t => isSetTab(t)).length;
  const isUnlimited = hasFeature('tabs.unlimited');

  const openTab = useCallback(
    (tab: SetTab) => {
      // If tab already exists, always allow (just switches to it / updates metadata)
      const exists = tabs.some(
        t => isSetTab(t) && t.id.toLowerCase() === tab.id.toLowerCase()
      );
      if (exists) {
        storeOpenTab(tab);
        return true;
      }

      // New tab — enforce limit for free tier
      if (setTabCount >= FREE_TAB_LIMIT && !isUnlimited) {
        setShowUpgradeModal(true);
        return false;
      }
      storeOpenTab(tab);
      return true;
    },
    [tabs, setTabCount, isUnlimited, storeOpenTab]
  );

  const replaceLandingWithSet = useCallback(
    (landingTabId: string, setTab: SetTab) => {
      // If the set tab already exists, the store removes the landing and activates
      // the existing set tab — net set-tab count doesn't increase. Always allow.
      const exists = tabs.some(
        t => isSetTab(t) && t.id.toLowerCase() === setTab.id.toLowerCase()
      );
      if (exists) {
        storeReplaceLandingWithSet(landingTabId, setTab);
        return true;
      }

      // Replacing a landing with a NEW set tab increases set-tab count by 1.
      if (setTabCount >= FREE_TAB_LIMIT && !isUnlimited) {
        setShowUpgradeModal(true);
        return false;
      }
      storeReplaceLandingWithSet(landingTabId, setTab);
      return true;
    },
    [tabs, setTabCount, isUnlimited, storeReplaceLandingWithSet]
  );

  return {
    openTab,
    replaceLandingWithSet,
    showUpgradeModal,
    dismissUpgradeModal: useCallback(() => setShowUpgradeModal(false), []),
    gateFeature: 'tabs.unlimited' as FeatureGateKey,
  };
}
