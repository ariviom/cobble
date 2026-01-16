'use client';

import { cn } from '@/app/components/ui/utils';
import { removeTab, type OpenTab } from '@/app/store/open-tabs';
import { X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type SetTabItemProps = {
  tab: OpenTab;
  isActive: boolean;
  hasSearchParty: boolean;
};

export function SetTabItem({ tab, isActive, hasSearchParty }: SetTabItemProps) {
  const router = useRouter();

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // If closing active tab, navigate to another tab
      if (isActive) {
        // Get current tabs from localStorage to find next tab
        const storedTabs = localStorage.getItem('brick_party_open_tabs_v1');
        if (storedTabs) {
          try {
            const tabs = JSON.parse(storedTabs) as OpenTab[];
            const currentIndex = tabs.findIndex(
              t => t.setNumber.toLowerCase() === tab.setNumber.toLowerCase()
            );
            const remainingTabs = tabs.filter(
              t => t.setNumber.toLowerCase() !== tab.setNumber.toLowerCase()
            );

            if (remainingTabs.length > 0) {
              // Navigate to next tab (or previous if last)
              const nextIndex = Math.min(
                currentIndex,
                remainingTabs.length - 1
              );
              const nextTab = remainingTabs[nextIndex];
              if (nextTab) {
                router.push(`/sets/${nextTab.setNumber}`);
              }
            } else {
              // No tabs left, go home
              router.push('/');
            }
          } catch {
            router.push('/');
          }
        }
      }

      removeTab(tab.setNumber);
    },
    [isActive, router, tab.setNumber]
  );

  // Truncate name for display
  const displayName =
    tab.name.length > 24 ? `${tab.name.slice(0, 22)}...` : tab.name;

  const tabUrl = `/sets/${tab.setNumber}`;

  return (
    <Link
      href={tabUrl}
      prefetch={true}
      role="tab"
      aria-selected={isActive}
      aria-label={`${tab.setNumber}: ${tab.name}`}
      {...(isActive ? { onClick: e => e.preventDefault() } : {})}
      className={cn(
        'group relative flex h-8 flex-shrink-0 items-center gap-2 rounded-md border-2 px-2 pr-7 transition-all',
        isActive
          ? 'border-theme-primary bg-theme-primary/10 text-foreground'
          : 'border-transparent bg-transparent text-foreground-muted hover:border-subtle hover:bg-card-muted hover:text-foreground'
      )}
    >
      {/* Set image */}
      <div className="relative size-5 flex-shrink-0 overflow-hidden rounded">
        {tab.imageUrl ? (
          <Image
            src={tab.imageUrl}
            alt=""
            width={20}
            height={20}
            className="size-full object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-neutral-200 text-[8px] text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
            ?
          </div>
        )}
      </div>

      {/* Set number and name */}
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span className="font-bold">{tab.setNumber}</span>
        <span className="hidden text-foreground-muted sm:inline">
          {displayName}
        </span>
      </div>

      {/* Search Party indicator */}
      {hasSearchParty && (
        <span
          className="absolute -top-1 -right-1 size-2.5 rounded-full bg-brand-blue"
          title="Search Party active"
        />
      )}

      {/* Close button */}
      <button
        type="button"
        onClick={handleClose}
        className={cn(
          'absolute right-1 flex size-5 items-center justify-center rounded transition-opacity',
          'text-foreground-muted hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-700',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        aria-label={`Close ${tab.setNumber}`}
      >
        <X size={12} />
      </button>
    </Link>
  );
}
