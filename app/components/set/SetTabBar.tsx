'use client';

import { SetTabItem } from '@/app/components/set/SetTabItem';
import { cn } from '@/app/components/ui/utils';
import type { OpenTab } from '@/app/store/open-tabs';
import { Plus } from 'lucide-react';

type SetTabBarProps = {
  tabs: OpenTab[];
  activeTabId: string;
  /** Callback when a tab is activated (for SPA mode). */
  onActivateTab?: ((id: string) => void) | undefined;
  /** Callback when a tab is closed (for SPA mode). */
  onCloseTab?: ((id: string) => void) | undefined;
  /** Callback when the + button is clicked to open a new landing tab. */
  onOpenLandingTab?: (() => void) | undefined;
};

export function SetTabBar({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onOpenLandingTab,
}: SetTabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  // Find the index of the active tab for divider logic
  const activeIndex = tabs.findIndex(
    t => t.id.toLowerCase() === activeTabId.toLowerCase()
  );

  return (
    <div
      data-testid="set-tab-bar"
      className={cn(
        'flex w-full max-w-full items-center pr-11 pl-32 lg:pr-0 lg:pl-0',
        'min-h-11 lg:min-h-9', // 44px mobile, 36px desktop
        'bg-background',
        'lg:col-span-full'
      )}
    >
      <nav
        className="relative flex h-full w-full items-end overflow-x-auto px-1 no-scrollbar lg:pr-0 lg:pl-2"
        aria-label="Open sets"
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-subtle" />
        {tabs.map((tab: OpenTab, index: number) => {
          const isActive = tab.id.toLowerCase() === activeTabId.toLowerCase();
          // Show divider if: not first tab, not active, and previous tab is not active
          const showDivider =
            index !== activeIndex - 1 && index !== activeIndex;

          return (
            <SetTabItem
              key={tab.id}
              tab={tab}
              isActive={isActive}
              showDivider={showDivider}
              hasSearchParty={tab.type === 'set' && !!tab.groupSessionId}
              onActivate={onActivateTab}
              onClose={onCloseTab}
            />
          );
        })}

        {/* Add tab button */}
        <div
          className={cn(
            'fixed right-0 mb-0.5 flex flex-shrink-0 items-center justify-center border-l border-subtle transition-all lg:sticky lg:right-0 lg:border-none lg:bg-background',
            'size-11 pt-1.25 lg:size-9' // 36px mobile, 28px desktop
          )}
        >
          <button
            type="button"
            onClick={onOpenLandingTab}
            className={cn(
              'mb-1 flex size-6 flex-shrink-0 items-center justify-center rounded transition-colors lg:size-8',
              'text-foreground-muted/70 hover:bg-theme-primary/10 hover:text-foreground'
            )}
            aria-label="Open new tab"
          >
            <Plus size={16} />
          </button>
        </div>
      </nav>
    </div>
  );
}
