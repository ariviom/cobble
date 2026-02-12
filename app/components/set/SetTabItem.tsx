'use client';

import { cn } from '@/app/components/ui/utils';
import type { OpenTab } from '@/app/store/open-tabs';
import { isLandingTab } from '@/app/store/open-tabs';
import { Layers, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';

type SetTabItemProps = {
  tab: OpenTab;
  isActive: boolean;
  /** Show a divider on the left side of this tab */
  showDivider?: boolean;
  hasSearchParty: boolean;
  /** Callback when tab is activated (for SPA mode). */
  onActivate?: ((id: string) => void) | undefined;
  /** Callback when tab is closed (for SPA mode). */
  onClose?: ((id: string) => void) | undefined;
};

export function SetTabItem({
  tab,
  isActive,
  showDivider = false,
  hasSearchParty,
  onActivate,
  onClose,
}: SetTabItemProps) {
  const isLanding = isLandingTab(tab);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // In SPA mode, prevent navigation and use callback
      if (onActivate) {
        e.preventDefault();
        if (!isActive) {
          onActivate(tab.id);
        }
      }
      // In MPA mode (no onActivate), let the Link handle navigation
      // but still prevent if already active
      else if (isActive) {
        e.preventDefault();
      }
    },
    [isActive, onActivate, tab.id]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Let parent handle close logic
      if (onClose) {
        onClose(tab.id);
      }
    },
    [onClose, tab.id]
  );

  // Landing tabs link to /sets; set tabs link to /sets/{id}
  const tabUrl = isLanding ? '/sets' : `/sets/${tab.id}`;

  // Landing tab display
  if (isLanding) {
    return (
      <>
        <div
          className={cn(
            'flex h-11 items-end gap-4 py-1 lg:h-9 lg:min-w-fit',
            isActive && 'fixed left-0 z-10 lg:static'
          )}
        >
          <Link
            href={tabUrl}
            prefetch={true}
            role="tab"
            aria-selected={isActive}
            aria-label="Sets"
            onClick={handleClick}
            className={cn(
              'group relative flex h-full w-32 flex-shrink-0 items-center gap-2 px-3 pr-10 transition-colors lg:w-auto lg:pr-8',
              isActive
                ? 'rounded-t-sm bg-card text-foreground'
                : 'rounded text-foreground-muted hover:rounded-md hover:border-transparent hover:bg-theme-primary/10 hover:text-foreground'
            )}
          >
            {/* bridge to card background */}
            {isActive && (
              <div className="absolute inset-x-0 -bottom-2 h-2 bg-card" />
            )}
            {/* Sets icon */}
            <div className="flex size-5 flex-shrink-0 items-center justify-center">
              <Layers size={16} />
            </div>

            {/* Label */}
            <div className="flex min-w-24 items-center gap-1.5 text-xs font-medium">
              <span className="font-bold">Sets</span>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'absolute right-1.5 flex items-center justify-center rounded transition-colors',
                'size-7 lg:size-5',
                isActive
                  ? 'text-foreground-muted hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-700'
                  : 'text-foreground-muted/70 hover:bg-theme-primary/15 hover:text-foreground'
              )}
              aria-label="Close tab"
            >
              <X size={12} />
            </button>
          </Link>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            'flex h-full min-h-11 w-4 items-center justify-center lg:min-h-9',
            !showDivider && 'lg:hidden'
          )}
        >
          <div
            className={cn(
              'h-5 w-px bg-foreground-muted/30 lg:h-4',
              isActive && 'hidden'
            )}
          ></div>
        </div>
      </>
    );
  }

  // Set tab display
  // Truncate name for display
  const displayName =
    tab.name.length > 24 ? `${tab.name.slice(0, 22)}...` : tab.name;

  return (
    <>
      <div
        className={cn(
          'flex h-11 items-end gap-4 py-1 lg:h-9 lg:min-w-fit',
          isActive && 'fixed left-0 z-10 lg:static'
        )}
      >
        <Link
          href={tabUrl}
          prefetch={true}
          role="tab"
          aria-selected={isActive}
          aria-label={`${tab.id}: ${tab.name}`}
          onClick={handleClick}
          className={cn(
            'group relative flex h-full w-32 flex-shrink-0 items-center gap-2 px-3 pr-10 transition-colors lg:w-auto lg:pr-8',
            isActive
              ? 'rounded-t-sm bg-card text-foreground'
              : 'rounded text-foreground-muted hover:rounded-md hover:border-transparent hover:bg-theme-primary/10 hover:text-foreground'
          )}
        >
          {/* bridge to card background */}
          {isActive && (
            <div className="absolute inset-x-0 -bottom-2 h-2 bg-card" />
          )}
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
          <div className="flex min-w-16 items-center gap-1.5 text-xs font-medium">
            <span className="font-bold">{tab.id}</span>
            <span className="hidden text-foreground-muted lg:inline">
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

          {/* Close button - always visible */}
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'absolute right-1.5 flex items-center justify-center rounded transition-colors',
              'size-7 lg:size-5',
              isActive
                ? 'text-foreground-muted hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-700'
                : 'text-foreground-muted/70 hover:bg-theme-primary/15 hover:text-foreground'
            )}
            aria-label={`Close ${tab.id}`}
          >
            <X size={12} />
          </button>
        </Link>
      </div>
      <div
        aria-hidden="true"
        className="flex h-full min-h-11 w-4 items-center justify-center lg:min-h-9"
      >
        <div
          className={cn(
            'h-5 w-px bg-foreground-muted/30 lg:h-4',
            (!showDivider || isActive) && 'hidden'
          )}
        ></div>
      </div>
    </>
  );
}
