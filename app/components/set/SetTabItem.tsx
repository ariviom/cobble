'use client';

import { cn } from '@/app/components/ui/utils';
import type { OpenTab } from '@/app/store/open-tabs';
import { isLandingTab, isSetTab } from '@/app/store/open-tabs';
import { Layers, Users, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';

type SetTabItemProps = {
  tab: OpenTab;
  isActive: boolean;
  /** Show a divider on the left side of this tab */
  showDivider?: boolean;
  /** Last tab in the bar — suppress trailing divider */
  isLast?: boolean;
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
  isLast = false,
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

  // Landing tabs link to /sets; set tabs link to /sets/{setNumber}
  const displaySetNumber = isSetTab(tab) ? tab.setNumber : tab.id;
  const tabUrl = isLanding ? '/sets' : `/sets/${displaySetNumber}`;

  // Landing tab display
  if (isLanding) {
    return (
      <>
        <div
          className={cn(
            'flex h-11 max-w-40 min-w-36 flex-1 items-end lg:h-9 lg:max-w-60 lg:min-w-20',
            isActive
              ? 'fixed left-0 z-10 w-36 pt-1 lg:static lg:w-auto'
              : 'py-1.5'
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
              'group relative flex h-full w-full min-w-0 items-center gap-2 px-3 pr-10 transition-colors lg:pr-8',
              isActive
                ? 'z-10 rounded-t-md bg-card text-foreground [--tab-curve-size:var(--spacing-tab-curve-size)] before:tab-curve-left after:tab-curve-right'
                : 'rounded-md text-foreground-muted hover:bg-theme-primary/15 hover:text-foreground'
            )}
          >
            {/* Sets icon */}
            <div className="flex size-5 flex-shrink-0 items-center justify-center">
              <Layers size={16} />
            </div>

            {/* Label */}
            <span className="truncate text-xs font-medium">
              <span className="font-bold">Sets</span>
            </span>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'absolute right-1.5 flex items-center justify-center rounded-full transition-colors',
                'size-7 lg:size-5',
                isActive
                  ? 'text-foreground-muted hover:bg-foreground/10 hover:text-foreground'
                  : 'text-foreground-muted/70 hover:bg-theme-primary/15 hover:text-foreground'
              )}
              aria-label="Close tab"
            >
              <X size={12} />
            </button>
          </Link>
        </div>
        {!isLast && (
          <div
            aria-hidden="true"
            className="flex h-full min-h-11 w-4 items-center justify-center lg:min-h-9"
          >
            <div
              className={cn(
                'h-5 w-px bg-foreground-muted/30 lg:h-4',
                (!showDivider || isActive) && 'invisible'
              )}
            ></div>
          </div>
        )}
      </>
    );
  }

  // Set tab display
  return (
    <>
      <div
        className={cn(
          'flex h-11 max-w-40 min-w-36 flex-1 items-end lg:h-9 lg:max-w-60 lg:min-w-20',
          isActive
            ? 'fixed left-0 z-10 w-36 pt-1 lg:static lg:w-auto'
            : 'py-1.5'
        )}
      >
        <Link
          href={tabUrl}
          prefetch={true}
          role="tab"
          aria-selected={isActive}
          aria-label={`${displaySetNumber}: ${tab.name}`}
          onClick={handleClick}
          className={cn(
            'group relative flex h-full w-full min-w-0 items-center gap-2 px-3 pr-10 transition-colors lg:pr-8',
            isActive
              ? 'z-10 rounded-t-md bg-card text-foreground [--tab-curve-size:var(--spacing-tab-curve-size)] before:tab-curve-left after:tab-curve-right'
              : 'rounded-md text-foreground-muted hover:bg-theme-primary/15 hover:text-foreground'
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
          <span className="truncate text-xs font-medium">
            <span className="font-bold">{displaySetNumber}</span>{' '}
            <span className="text-foreground-muted">{tab.name}</span>
          </span>

          {/* Search Party indicator */}
          {hasSearchParty && (
            <span
              className="flex size-4 flex-shrink-0 items-center justify-center rounded-full bg-theme-primary ring-1 ring-theme-primary"
              title="Search Party active"
            >
              <Users
                size={10}
                className="size-2.5 text-theme-primary-contrast"
              />
            </span>
          )}

          {/* Close button - always visible */}
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'absolute right-1.5 flex items-center justify-center rounded-full transition-colors',
              'size-7 lg:size-5',
              isActive
                ? 'text-foreground-muted hover:bg-foreground/10 hover:text-foreground'
                : 'text-foreground-muted/70 hover:bg-theme-primary/15 hover:text-foreground'
            )}
            aria-label={`Close ${displaySetNumber}`}
          >
            <X size={12} />
          </button>
        </Link>
      </div>
      {!isLast && (
        <div
          aria-hidden="true"
          className="flex h-full min-h-11 w-4 items-center justify-center lg:min-h-9"
        >
          <div
            className={cn(
              'h-5 w-px bg-foreground-muted/30 lg:h-4',
              (!showDivider || isActive) && 'invisible'
            )}
          ></div>
        </div>
      )}
    </>
  );
}
