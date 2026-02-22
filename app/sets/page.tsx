'use client';

import { SetPageSkeleton } from '@/app/components/set/SetPageSkeleton';
import { SetTabBar } from '@/app/components/set/SetTabBar';
import { SetTabContainer } from '@/app/components/set/SetTabContainer';
import { SetsLandingContent } from '@/app/components/sets/SetsLandingContent';
import { cn } from '@/app/components/ui/utils';
import { useDynamicTitle } from '@/app/hooks/useDynamicTitle';
import { useIsDesktop } from '@/app/hooks/useIsDesktop';
import { readStorage } from '@/app/lib/persistence/storage';
import {
  useOpenTabsStore,
  isSetTab,
  isLandingTab,
  type SetTab,
  type TabViewState,
} from '@/app/store/open-tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * SPA container for multi-tab set views.
 *
 * Architecture:
 * - Supports two tab types: SetTab (inventory viewer) and LandingTab (home content)
 * - One container div per open tab
 * - Only the active tab has its children mounted (others have display:none)
 * - Scroll position saved from Inventory grid wrapper before tab switch
 * - Filter state saved on tab content unmount
 * - "+" button creates a new landing tab (Chrome new-tab pattern)
 * - Clicking a set from a landing tab replaces it in-place
 */
export default function SetsPage() {
  const isDesktop = useIsDesktop();

  // Track client-side mount to handle SSR → hydration transition
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const tabs = useOpenTabsStore(state => state.tabs);
  const activeTabId = useOpenTabsStore(state => state.activeTabId);
  const tabStates = useOpenTabsStore(state => state.tabStates);
  const setActiveTab = useOpenTabsStore(state => state.setActiveTab);
  const closeTab = useOpenTabsStore(state => state.closeTab);
  const saveTabState = useOpenTabsStore(state => state.saveTabState);
  const openLandingTab = useOpenTabsStore(state => state.openLandingTab);
  const replaceLandingWithSet = useOpenTabsStore(
    state => state.replaceLandingWithSet
  );

  // Auto-create a landing tab if store hydrates with no tabs
  const hasAutoCreatedRef = useRef(false);
  useEffect(() => {
    if (!hasMounted || hasAutoCreatedRef.current) return;
    if (tabs.length === 0) {
      hasAutoCreatedRef.current = true;
      openLandingTab();
    }
  }, [hasMounted, tabs.length, openLandingTab]);

  // Dynamic page title based on active tab
  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId),
    [tabs, activeTabId]
  );
  const pageTitle = useMemo(() => {
    if (!activeTab) return null;
    if (isSetTab(activeTab)) {
      return `${activeTab.setNumber} ${activeTab.name}`;
    }
    return 'Sets';
  }, [activeTab]);
  useDynamicTitle(pageTitle);

  // Track the previous active tab for saving scroll state on switch
  const prevActiveRef = useRef<string | null>(null);

  // Save current tab's scroll position before switching
  const saveCurrentScroll = useCallback(() => {
    if (!prevActiveRef.current) return;

    const id = prevActiveRef.current;

    // Only save scroll for set tabs
    const prevTab = tabs.find(t => t.id === id);
    if (!prevTab || !isSetTab(prevTab)) return;

    let scrollTop = 0;

    if (isDesktop) {
      const scroller = document.querySelector(
        `[data-inventory-scroller="${id}"]`
      );
      if (scroller) {
        scrollTop = scroller.scrollTop;
      }
    } else {
      scrollTop = window.scrollY;
    }

    saveTabState(id, { scrollTop });
  }, [isDesktop, saveTabState, tabs]);

  // Handle tab activation
  const handleActivateTab = useCallback(
    (id: string) => {
      // Save current tab state before switching
      saveCurrentScroll();

      // Switch to new tab
      setActiveTab(id);

      // Update URL: landing tabs get /sets, set tabs get /sets?active=id
      const tab = tabs.find(t => t.id === id);
      if (tab && isLandingTab(tab)) {
        window.history.pushState(null, '', '/sets');
      } else {
        window.history.pushState(null, '', `/sets?active=${id}`);
      }
    },
    [saveCurrentScroll, setActiveTab, tabs]
  );

  // Fire a leave request for an SP tab (fire-and-forget, survives page transitions)
  const fireLeave = useCallback((slug: string) => {
    const clientToken = readStorage('brick_party_group_client_id_v1');
    if (!clientToken) return;
    try {
      void fetch(`/api/group-sessions/${encodeURIComponent(slug)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientToken }),
        keepalive: true,
      });
    } catch {
      // best-effort
    }
  }, []);

  // Host close confirmation state
  const [closeRequestedTabId, setCloseRequestedTabId] = useState<string | null>(
    null
  );

  // Execute the actual close logic for a tab (shared by direct close and confirmed close)
  const executeClose = useCallback(
    (id: string) => {
      // If closing an SP tab, fire a leave request
      const closingTab = tabs.find(t => t.id === id);
      if (closingTab && isSetTab(closingTab) && closingTab.groupSessionSlug) {
        fireLeave(closingTab.groupSessionSlug);
      }

      const remainingTabs = tabs.filter(t => t.id !== id);

      closeTab(id);

      // If we closed the last tab, auto-create a new landing tab
      if (remainingTabs.length === 0) {
        openLandingTab();
        window.history.pushState(null, '', '/sets');
      } else {
        // URL will be updated based on the store's activeTabId change
        const newActiveId =
          activeTabId === id ? remainingTabs[0]?.id : activeTabId;
        if (newActiveId) {
          const newActiveTab = remainingTabs.find(t => t.id === newActiveId);
          if (newActiveTab && isLandingTab(newActiveTab)) {
            window.history.pushState(null, '', '/sets');
          } else if (newActiveId) {
            window.history.pushState(null, '', `/sets?active=${newActiveId}`);
          }
        }
      }
    },
    [closeTab, tabs, activeTabId, openLandingTab, fireLeave]
  );

  // Handle tab close — intercept host SP tabs for confirmation
  const handleCloseTab = useCallback(
    (id: string) => {
      const closingTab = tabs.find(t => t.id === id);
      if (
        closingTab &&
        isSetTab(closingTab) &&
        closingTab.groupRole === 'host' &&
        closingTab.groupSessionId
      ) {
        // Host SP tab — prompt for confirmation
        setCloseRequestedTabId(id);
        return;
      }
      executeClose(id);
    },
    [tabs, executeClose]
  );

  // Confirmed close from host SP modal
  const handleConfirmClose = useCallback(
    (id: string) => {
      setCloseRequestedTabId(null);
      executeClose(id);
    },
    [executeClose]
  );

  // Cancel close from host SP modal
  const handleCancelClose = useCallback(() => {
    setCloseRequestedTabId(null);
  }, []);

  // Handle opening a new landing tab via "+" button
  const handleOpenLandingTab = useCallback(() => {
    saveCurrentScroll();
    openLandingTab();
    window.history.pushState(null, '', '/sets');
  }, [saveCurrentScroll, openLandingTab]);

  // Handle selecting a set from a landing tab's content
  const handleSelectSetFromLanding = useCallback(
    (landingTabId: string) => (setTab: SetTab) => {
      replaceLandingWithSet(landingTabId, setTab);
      window.history.pushState(null, '', `/sets?active=${setTab.id}`);
    },
    [replaceLandingWithSet]
  );

  // Sync URL with active tab on mount and handle popstate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activeFromUrl = params.get('active');

    if (activeFromUrl && tabs.some(t => t.id === activeFromUrl)) {
      if (activeFromUrl !== activeTabId) {
        setActiveTab(activeFromUrl);
      }
    } else if (activeTabId) {
      const currentActive = tabs.find(t => t.id === activeTabId);
      if (currentActive && isLandingTab(currentActive)) {
        window.history.replaceState(null, '', '/sets');
      } else if (currentActive) {
        window.history.replaceState(null, '', `/sets?active=${activeTabId}`);
      }
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const active = params.get('active');
      if (active && tabs.some(t => t.id === active)) {
        saveCurrentScroll();
        setActiveTab(active);
      } else {
        // No ?active= param — try to activate a landing tab
        const landingTab = tabs.find(t => isLandingTab(t));
        if (landingTab) {
          saveCurrentScroll();
          setActiveTab(landingTab.id);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [tabs, activeTabId, setActiveTab, saveCurrentScroll]);

  // Track active tab changes (scroll restoration is handled by SetTabContainerContent)
  useEffect(() => {
    if (prevActiveRef.current !== activeTabId) {
      prevActiveRef.current = activeTabId;
    }
  }, [activeTabId]);

  // During SSR/hydration, isDesktop is undefined and tabs may be empty (no localStorage on server)
  const isHydrating = isDesktop === undefined || !hasMounted;

  // During SSR/hydration, always show skeleton so server and client match
  // (Zustand persist can hydrate tabs from localStorage before useEffect,
  // causing a mismatch if we conditionally render based on tabs.length)
  if (isHydrating) {
    return <SetPageSkeleton variant="minimal" />;
  }

  return (
    <div
      className={cn(
        'set-grid-layout min-h-[100dvh]',
        'lg:h-[calc(100dvh-var(--spacing-nav-offset))] lg:min-h-0 lg:overflow-hidden'
      )}
      data-has-tabs="true"
    >
      {/* Tab bar - always visible when we have tabs */}
      <header className="sticky top-0 z-60 col-span-full bg-card lg:contents">
        <SetTabBar
          tabs={tabs}
          activeTabId={activeTabId ?? ''}
          onActivateTab={handleActivateTab}
          onCloseTab={handleCloseTab}
          onOpenLandingTab={handleOpenLandingTab}
        />
      </header>

      {/* Landing tabs — full-width, no sidebar */}
      {tabs.map(tab => {
        if (!isLandingTab(tab)) return null;
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            style={{ display: isActive ? 'block' : 'none' }}
            className="col-span-full lg:row-start-2 lg:row-end-5 lg:min-h-0 lg:overflow-auto"
          >
            <SetsLandingContent
              onSelectSet={handleSelectSetFromLanding(tab.id)}
              isActive={isActive}
            />
          </div>
        );
      })}

      {/* Set tabs — positioned in column 2 (sidebar + main), scroll happens inside inventory */}
      <div className="pointer-events-none relative col-span-full lg:col-start-2 lg:row-start-2 lg:row-end-5 lg:flex lg:flex-col [&>*]:pointer-events-auto">
        {tabs.map(tab => {
          if (!isSetTab(tab)) return null;
          const isActive = tab.id === activeTabId;
          const state = tabStates[tab.id];
          return (
            <SetTabContainer
              key={tab.id}
              tab={tab}
              isActive={isActive}
              savedScrollTop={state?.scrollTop}
              savedControlsState={state}
              onSaveState={(partialState: Partial<TabViewState>) => {
                saveTabState(tab.id, partialState);
              }}
              isDesktop={isDesktop}
              closeRequested={closeRequestedTabId === tab.id}
              onConfirmClose={handleConfirmClose}
              onCancelClose={handleCancelClose}
            />
          );
        })}
      </div>
    </div>
  );
}
