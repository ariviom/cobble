'use client';

import { SetTabItem } from '@/app/components/set/SetTabItem';
import { cn } from '@/app/components/ui/utils';
import { addTab, type OpenTab } from '@/app/store/open-tabs';
import { getRecentSets, type RecentSetEntry } from '@/app/store/recent-sets';
import { Plus, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type SetTabBarProps = {
  tabs: OpenTab[];
  activeSetNumber: string;
  groupSessionSetNumber: string | null;
};

export function SetTabBar({
  tabs,
  activeSetNumber,
  groupSessionSetNumber,
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

  const handleOpenRecentSet = useCallback((entry: RecentSetEntry) => {
    // Add the set as a tab (navigation happens via Link)
    addTab({
      setNumber: entry.setNumber,
      name: entry.name,
      imageUrl: entry.imageUrl,
      numParts: entry.numParts,
      year: entry.year,
    });
    setIsDropdownOpen(false);
  }, []);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="set-tab-bar"
      className={cn(
        'fixed right-0 left-0 z-[999] flex w-full items-center',
        'top-0',
        'border-b-2 border-subtle bg-card shadow-sm',
        'lg:top-[var(--spacing-nav-height)]'
      )}
    >
      <nav
        className={cn(
          'flex h-10 w-full items-center gap-1 overflow-x-auto px-2 no-scrollbar',
          'lg:px-3 lg:pl-[calc(20rem+0.75rem)]'
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
                        href={`/sets/id/${entry.setNumber}`}
                        prefetch={true}
                        onClick={() => handleOpenRecentSet(entry)}
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
                            <div className="flex size-full items-center justify-center text-[10px] text-neutral-400">
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
