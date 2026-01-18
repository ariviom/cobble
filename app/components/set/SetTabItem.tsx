'use client';

import { cn } from '@/app/components/ui/utils';
import type { OpenTab } from '@/app/components/set/SetTabBar';
import { X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';

type SetTabItemProps = {
  tab: OpenTab;
  isActive: boolean;
  hasSearchParty: boolean;
  /** Callback when tab is activated (for SPA mode). */
  onActivate?: ((setNumber: string) => void) | undefined;
  /** Callback when tab is closed (for SPA mode). */
  onClose?: ((setNumber: string) => void) | undefined;
};

export function SetTabItem({
  tab,
  isActive,
  hasSearchParty,
  onActivate,
  onClose,
}: SetTabItemProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // In SPA mode, prevent navigation and use callback
      if (onActivate) {
        e.preventDefault();
        if (!isActive) {
          onActivate(tab.setNumber);
        }
      }
      // In MPA mode (no onActivate), let the Link handle navigation
      // but still prevent if already active
      else if (isActive) {
        e.preventDefault();
      }
    },
    [isActive, onActivate, tab.setNumber]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Let parent handle close logic
      if (onClose) {
        onClose(tab.setNumber);
      }
    },
    [onClose, tab.setNumber]
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
      onClick={handleClick}
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
