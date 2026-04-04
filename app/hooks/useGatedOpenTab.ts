'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import type { FeatureGateKey } from '@/app/components/upgrade-modal';
import { FREE_TAB_LIMIT } from '@/app/lib/domain/limits';
import { useOpenTabsStore, isSetTab, type SetTab } from '@/app/store/open-tabs';

type PendingOpen =
  | { kind: 'open'; tab: SetTab }
  | { kind: 'replaceLanding'; landingTabId: string; tab: SetTab };

type UseGatedOpenTabOptions = {
  /**
   * Called whenever a tab is actually opened through this hook — either
   * immediately on the happy path, or later when the user clicks Continue
   * in the upgrade modal after freeing up slots. Callers use this to run
   * navigation side effects like `router.push('/sets?active=...')`.
   */
  onOpened?: (tab: SetTab) => void;
};

/**
 * Wraps the open-tabs store actions with a free-tier tab limit check.
 *
 * - `openTab` gates NEW set tabs (existing tab switches are always allowed).
 * - `replaceLandingWithSet` gates when the replacement would exceed the limit.
 * - Landing tabs are never gated — they carry no inventory.
 *
 * When gated, the attempted open is remembered as a "pending" action.
 * Calling `continueFromUpgradeModal` replays it once the user has freed
 * enough slots (either by closing tabs in the modal, or via cross-tab sync
 * from another browser tab/window). `dismissUpgradeModal` drops the pending
 * action entirely — treat it as "cancel".
 */
export function useGatedOpenTab(options: UseGatedOpenTabOptions = {}) {
  const { hasFeature } = useEntitlements();
  const tabs = useOpenTabsStore(s => s.tabs);
  const storeOpenTab = useOpenTabsStore(s => s.openTab);
  const storeReplaceLandingWithSet = useOpenTabsStore(
    s => s.replaceLandingWithSet
  );
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [pending, setPending] = useState<PendingOpen | null>(null);

  // Keep the latest onOpened in a ref so callers can pass inline arrow
  // functions without invalidating the returned callbacks on every render.
  const onOpenedRef = useRef(options.onOpened);
  useEffect(() => {
    onOpenedRef.current = options.onOpened;
  });

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
        onOpenedRef.current?.(tab);
        return true;
      }

      // New tab — enforce limit for free tier
      if (setTabCount >= FREE_TAB_LIMIT && !isUnlimited) {
        setPending({ kind: 'open', tab });
        setShowUpgradeModal(true);
        return false;
      }
      storeOpenTab(tab);
      onOpenedRef.current?.(tab);
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
        onOpenedRef.current?.(setTab);
        return true;
      }

      // Replacing a landing with a NEW set tab increases set-tab count by 1.
      if (setTabCount >= FREE_TAB_LIMIT && !isUnlimited) {
        setPending({ kind: 'replaceLanding', landingTabId, tab: setTab });
        setShowUpgradeModal(true);
        return false;
      }
      storeReplaceLandingWithSet(landingTabId, setTab);
      onOpenedRef.current?.(setTab);
      return true;
    },
    [tabs, setTabCount, isUnlimited, storeReplaceLandingWithSet]
  );

  const dismissUpgradeModal = useCallback(() => {
    // Cancel — drop any pending open.
    setPending(null);
    setShowUpgradeModal(false);
  }, []);

  const continueFromUpgradeModal = useCallback(() => {
    // Commit the pending open if there's now room. The Modal's Continue
    // button is disabled until setTabCount drops below the limit, but
    // re-check here as a safety net.
    if (!pending) {
      setShowUpgradeModal(false);
      return;
    }
    if (setTabCount >= FREE_TAB_LIMIT && !isUnlimited) {
      return;
    }

    if (pending.kind === 'open') {
      storeOpenTab(pending.tab);
    } else {
      // If the landing tab the user originally clicked from was closed
      // meanwhile (e.g. via cross-tab sync), fall back to opening the set
      // as a fresh tab instead of replacing a landing that no longer exists.
      const landingStillExists = tabs.some(t => t.id === pending.landingTabId);
      if (landingStillExists) {
        storeReplaceLandingWithSet(pending.landingTabId, pending.tab);
      } else {
        storeOpenTab(pending.tab);
      }
    }
    onOpenedRef.current?.(pending.tab);

    setPending(null);
    setShowUpgradeModal(false);
  }, [
    pending,
    setTabCount,
    isUnlimited,
    storeOpenTab,
    storeReplaceLandingWithSet,
    tabs,
  ]);

  return {
    openTab,
    replaceLandingWithSet,
    showUpgradeModal,
    dismissUpgradeModal,
    continueFromUpgradeModal,
    gateFeature: 'tabs.unlimited' as FeatureGateKey,
  };
}
