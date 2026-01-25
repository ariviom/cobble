'use client';

import { AddTabContent } from '@/app/components/set/AddTabContent';
import { SetTabItem } from '@/app/components/set/SetTabItem';
import { Modal } from '@/app/components/ui/Modal';
import { cn } from '@/app/components/ui/utils';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

/** Tab data shape (kept for future tab bar implementation) */
export type OpenTab = {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
};

type SetTabBarProps = {
  tabs: OpenTab[];
  activeSetNumber: string;
  groupSessionSetNumber: string | null;
  /** Callback when a tab is activated (for SPA mode). */
  onActivateTab?: ((setNumber: string) => void) | undefined;
  /** Callback when a tab is closed (for SPA mode). */
  onCloseTab?: ((setNumber: string) => void) | undefined;
  /** Callback when opening a new tab from recent sets dropdown (for SPA mode). */
  onOpenNewTab?: ((tab: OpenTab) => void) | undefined;
};

export function SetTabBar({
  tabs,
  activeSetNumber,
  groupSessionSetNumber,
  onActivateTab,
  onCloseTab,
  onOpenNewTab,
}: SetTabBarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenSet = useCallback(
    (tab: OpenTab) => {
      if (onOpenNewTab) {
        onOpenNewTab(tab);
      } else if (onActivateTab) {
        onActivateTab(tab.setNumber);
      }
    },
    [onActivateTab, onOpenNewTab]
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  if (tabs.length === 0) {
    return null;
  }

  // Find the index of the active tab for divider logic
  const activeIndex = tabs.findIndex(
    t => t.setNumber.toLowerCase() === activeSetNumber.toLowerCase()
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
        className="relative flex h-full w-full items-end overflow-x-auto px-1 no-scrollbar lg:px-0"
        aria-label="Open sets"
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-subtle" />
        {tabs.map((tab: OpenTab, index: number) => {
          const isActive =
            tab.setNumber.toLowerCase() === activeSetNumber.toLowerCase();
          // Show divider if: not first tab, not active, and previous tab is not active
          const showDivider =
            index !== activeIndex - 1 &&
            index !== activeIndex &&
            index !== tabs.length - 1;

          return (
            <SetTabItem
              key={tab.setNumber}
              tab={tab}
              isActive={isActive}
              showDivider={showDivider}
              hasSearchParty={
                groupSessionSetNumber !== null &&
                tab.setNumber.toLowerCase() ===
                  groupSessionSetNumber.toLowerCase()
              }
              onActivate={onActivateTab}
              onClose={onCloseTab}
            />
          );
        })}

        {/* Add tab button */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={cn(
            'fixed right-0 mb-0.5 flex flex-shrink-0 items-center justify-center border-l border-subtle transition-all lg:sticky lg:right-0 lg:border-x lg:bg-background',
            'size-11 pt-1 lg:size-9', // 36px mobile, 28px desktop
            'text-foreground-muted/70 hover:bg-theme-primary/10 hover:text-foreground'
          )}
          aria-label="Open set in new tab"
        >
          <Plus size={16} />
        </button>
      </nav>

      {/* Add tab modal */}
      <Modal open={isModalOpen} title="View Set" onClose={handleCloseModal}>
        <AddTabContent
          openTabs={tabs}
          onOpenSet={handleOpenSet}
          onClose={handleCloseModal}
        />
      </Modal>
    </div>
  );
}
