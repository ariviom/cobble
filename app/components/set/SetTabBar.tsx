'use client';

import { SetTabItem } from '@/app/components/set/SetTabItem';
import { cn } from '@/app/components/ui/utils';
import { getRecentSets, type RecentSetEntry } from '@/app/store/recent-sets';
import { Plus, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

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
};

export function SetTabBar({
  tabs,
  activeSetNumber,
  groupSessionSetNumber,
  onActivateTab,
  onCloseTab,
}: SetTabBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [recentSets, setRecentSets] = useState<RecentSetEntry[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load recent sets when dropdown opens
  useEffect(() => {
    if (isDropdownOpen) {
      const recent = getRecentSets();
      // Filter out sets that are already open as tabs
      const openSetNumbers = new Set(tabs.map(t => t.setNumber.toLowerCase()));
      const filtered = recent.filter(
        r => !openSetNumbers.has(r.setNumber.toLowerCase())
      );
      setRecentSets(filtered.slice(0, 10)); // Show max 10 recent sets
    }
  }, [isDropdownOpen, tabs]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Close dropdown on escape key
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDropdownOpen]);

  const handleOpenRecentSet = useCallback(
    (entry: RecentSetEntry, e?: React.MouseEvent) => {
      setIsDropdownOpen(false);

      // In SPA mode, prevent Link navigation and use callback
      if (onActivateTab) {
        e?.preventDefault();
        onActivateTab(entry.setNumber);
      }
    },
    [onActivateTab]
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="set-tab-bar"
      className={cn(
        'flex w-full max-w-full items-center',
        'border-b-2 border-subtle bg-card shadow-sm',
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
        <div className="relative flex-shrink-0">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={cn(
              'flex size-8 items-center justify-center rounded-md border-2 transition-all',
              isDropdownOpen
                ? 'border-theme-primary bg-theme-primary/10 text-foreground'
                : 'border-transparent text-foreground-muted hover:border-subtle hover:bg-card-muted hover:text-foreground'
            )}
            aria-label="Open recent set in new tab"
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
          >
            <Plus size={16} />
          </button>

          {/* Recent sets dropdown */}
          {isDropdownOpen && (
            <div
              ref={dropdownRef}
              className={cn(
                'absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border-2 border-subtle bg-card shadow-lg',
                'max-h-80 overflow-y-auto'
              )}
              role="menu"
            >
              <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
                <span className="text-xs font-bold text-foreground-muted">
                  Recent Sets
                </span>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(false)}
                  className="text-foreground-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>

              {recentSets.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-foreground-muted">
                  No recent sets to open
                </div>
              ) : (
                <ul className="py-1">
                  {recentSets.map(entry => (
                    <li key={entry.setNumber}>
                      <Link
                        href={`/sets/${entry.setNumber}`}
                        prefetch={true}
                        onClick={e => handleOpenRecentSet(entry, e)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                          'hover:bg-card-muted'
                        )}
                        role="menuitem"
                      >
                        <div className="relative size-8 flex-shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                          {entry.imageUrl ? (
                            <Image
                              src={entry.imageUrl}
                              alt=""
                              width={32}
                              height={32}
                              className="size-full object-contain"
                            />
                          ) : (
                            <div className="text-2xs flex size-full items-center justify-center text-neutral-400">
                              ?
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {entry.name}
                          </div>
                          <div className="text-xs text-foreground-muted">
                            {entry.setNumber}
                            {entry.year > 0 && ` • ${entry.year}`}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
