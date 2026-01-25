'use client';

import { SetTabBar } from '@/app/components/set/SetTabBar';
import { SetTabContainer } from '@/app/components/set/SetTabContainer';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { cn } from '@/app/components/ui/utils';
import { useDynamicTitle } from '@/app/hooks/useDynamicTitle';
import { useIsDesktop } from '@/app/hooks/useIsDesktop';
import {
  useOpenTabsStore,
  type OpenTab,
  type TabViewState,
} from '@/app/store/open-tabs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * SPA container for multi-tab set views.
 *
 * Architecture:
 * - One container div per open tab
 * - Only the active tab has its children mounted (others have display:none)
 * - Scroll position saved from Inventory grid wrapper before tab switch
 * - Filter state saved on tab content unmount
 */
export default function SetsPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const tabs = useOpenTabsStore(state => state.tabs);
  const activeSetNumber = useOpenTabsStore(state => state.activeSetNumber);
  const tabStates = useOpenTabsStore(state => state.tabStates);
  const setActiveTab = useOpenTabsStore(state => state.setActiveTab);
  const closeTab = useOpenTabsStore(state => state.closeTab);
  const saveTabState = useOpenTabsStore(state => state.saveTabState);
  const openTab = useOpenTabsStore(state => state.openTab);

  // Dynamic page title based on active tab
  const activeTab = useMemo(
    () => tabs.find(t => t.setNumber === activeSetNumber),
    [tabs, activeSetNumber]
  );
  const pageTitle = useMemo(() => {
    if (!activeTab) return null;
    return `${activeTab.setNumber} ${activeTab.name}`;
  }, [activeTab]);
  useDynamicTitle(pageTitle);

  // Track the previous active tab for saving scroll state on switch
  const prevActiveRef = useRef<string | null>(null);

  // Save current tab's scroll position before switching
  // The scroll container is the Inventory grid wrapper with data-inventory-scroller
  const saveCurrentScroll = useCallback(() => {
    if (!prevActiveRef.current) return;

    const setNumber = prevActiveRef.current;
    let scrollTop = 0;

    if (isDesktop) {
      const scroller = document.querySelector(
        `[data-inventory-scroller="${setNumber}"]`
      );
      if (scroller) {
        scrollTop = scroller.scrollTop;
      }
    } else {
      scrollTop = window.scrollY;
    }

    saveTabState(setNumber, { scrollTop });
  }, [isDesktop, saveTabState]);

  // Handle tab activation
  const handleActivateTab = useCallback(
    (setNumber: string) => {
      // Save current tab state before switching
      saveCurrentScroll();

      // Switch to new tab
      setActiveTab(setNumber);

      // Update URL
      window.history.pushState(null, '', `/sets?active=${setNumber}`);
    },
    [saveCurrentScroll, setActiveTab]
  );

  // Handle tab close
  const handleCloseTab = useCallback(
    (setNumber: string) => {
      closeTab(setNumber);

      // If we closed the last tab, redirect to home
      const remainingTabs = tabs.filter(t => t.setNumber !== setNumber);
      if (remainingTabs.length === 0) {
        router.push('/');
      } else {
        // URL will be updated by the store's activeSetNumber change
        const newActive =
          activeSetNumber === setNumber
            ? remainingTabs[0]?.setNumber
            : activeSetNumber;
        if (newActive) {
          window.history.pushState(null, '', `/sets?active=${newActive}`);
        }
      }
    },
    [closeTab, tabs, activeSetNumber, router]
  );

  // Handle opening a new tab from dropdown (using recent set data)
  const handleOpenRecentTab = useCallback(
    (tab: OpenTab) => {
      saveCurrentScroll();
      openTab(tab);
      window.history.pushState(null, '', `/sets?active=${tab.setNumber}`);
    },
    [saveCurrentScroll, openTab]
  );

  // Sync URL with active tab on mount and handle popstate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activeFromUrl = params.get('active');

    if (activeFromUrl && tabs.some(t => t.setNumber === activeFromUrl)) {
      if (activeFromUrl !== activeSetNumber) {
        setActiveTab(activeFromUrl);
      }
    } else if (activeSetNumber) {
      window.history.replaceState(null, '', `/sets?active=${activeSetNumber}`);
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const active = params.get('active');
      if (active && tabs.some(t => t.setNumber === active)) {
        saveCurrentScroll();
        setActiveTab(active);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [tabs, activeSetNumber, setActiveTab, saveCurrentScroll]);

  // Track active tab changes (scroll restoration is handled by SetTabContainerContent)
  useEffect(() => {
    if (prevActiveRef.current !== activeSetNumber) {
      prevActiveRef.current = activeSetNumber;
    }
  }, [activeSetNumber]);

  // Redirect to home if no tabs
  useEffect(() => {
    if (tabs.length === 0) {
      router.push('/');
    }
  }, [tabs.length, router]);

  // Show loading state during SSR/hydration
  if (isDesktop === undefined) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <BrickLoader />
      </div>
    );
  }

  // No tabs - show empty state (will redirect)
  if (tabs.length === 0 || !activeSetNumber) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <BrickLoader />
      </div>
    );
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
          activeSetNumber={activeSetNumber}
          groupSessionSetNumber={null}
          onActivateTab={handleActivateTab}
          onCloseTab={handleCloseTab}
          onOpenNewTab={handleOpenRecentTab}
        />
      </header>

      {/* Main content area - positioned in column 2, scroll happens inside inventory */}
      <div className="relative col-span-full lg:col-start-2 lg:row-start-2 lg:row-end-5 lg:flex lg:flex-col">
        {/* Render a container for each tab */}
        {tabs.map(tab => {
          const isActive = tab.setNumber === activeSetNumber;
          const state = tabStates[tab.setNumber];

          return (
            <SetTabContainer
              key={tab.setNumber}
              tab={tab}
              isActive={isActive}
              savedScrollTop={state?.scrollTop}
              savedControlsState={state}
              onSaveState={(partialState: Partial<TabViewState>) => {
                saveTabState(tab.setNumber, partialState);
              }}
              isDesktop={isDesktop}
            />
          );
        })}
      </div>
    </div>
  );
}
