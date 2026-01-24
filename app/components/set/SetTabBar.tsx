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

  return (
    <div
      data-testid="set-tab-bar"
      className={cn(
        'flex w-full max-w-full items-center',
        'border-b border-subtle bg-card shadow-sm',
        'lg:col-span-full'
      )}
    >
      <nav
        className={cn(
          'flex h-10 w-full items-center gap-1 overflow-x-auto px-2 no-scrollbar',
          'lg:px-3'
        )}
        aria-label="Open sets"
      >
        {tabs.map(tab => (
          <SetTabItem
            key={tab.setNumber}
            tab={tab}
            isActive={
              tab.setNumber.toLowerCase() === activeSetNumber.toLowerCase()
            }
            hasSearchParty={
              groupSessionSetNumber !== null &&
              tab.setNumber.toLowerCase() ===
                groupSessionSetNumber.toLowerCase()
            }
            onActivate={onActivateTab}
            onClose={onCloseTab}
          />
        ))}

        {/* Add tab button */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={cn(
            'flex size-8 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all',
            'border-transparent text-foreground-muted hover:border-subtle hover:bg-card-muted hover:text-foreground'
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
