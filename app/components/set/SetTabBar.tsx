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
        'relative flex w-full max-w-full min-w-0 items-end pr-11 pl-36 lg:pr-2 lg:pl-0',
        'min-h-11 lg:min-h-9', // 44px mobile, 36px desktop
        'bg-background',
        'lg:col-span-full'
      )}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-subtle" />
      <nav
        className="relative flex h-full min-w-0 flex-1 items-end overflow-x-auto px-1 no-scrollbar lg:flex-initial lg:pl-2"
        aria-label="Open sets"
      >
        {tabs.map((tab: OpenTab, index: number) => {
          const isActive = index === activeIndex;
          // Show divider if: not active, and previous tab is not active
          const showDivider =
            index !== activeIndex - 1 && index !== activeIndex;

          return (
            <SetTabItem
              key={tab.id}
              tab={tab}
              isActive={isActive}
              showDivider={showDivider}
              isLast={index === tabs.length - 1}
              hasSearchParty={tab.type === 'set' && !!tab.groupSessionId}
              onActivate={onActivateTab}
              onClose={onCloseTab}
            />
          );
        })}
      </nav>

      {/* Add tab button */}
      <div
        className={cn(
          'fixed right-0 z-20 mb-0.5 flex flex-shrink-0 items-center justify-center border-l border-subtle bg-background transition-all lg:static lg:z-auto lg:border-none lg:bg-transparent',
          'size-11 pt-1.25 lg:size-9'
        )}
      >
        <button
          type="button"
          onClick={onOpenLandingTab}
          className={cn(
            'mb-1 flex size-6 flex-shrink-0 items-center justify-center transition-colors lg:size-8',
            'rounded-full text-foreground-muted/70 hover:bg-theme-primary/15 hover:text-foreground'
          )}
          aria-label="Open new tab"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
