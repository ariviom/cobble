'use client';

import { RowButton } from '@/app/components/ui/RowButton';
import { cn } from '@/app/components/ui/utils';
import { EMPTY_SET_STATUS, useUserSetsStore } from '@/app/store/user-sets';
import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type SetStatusMenuProps = {
  setNumber: string;
  name: string;
  year?: number;
  imageUrl?: string | null;
  numParts?: number;
  themeId?: number | null;
  className?: string;
  /**
   * Optional override for the Remove action.
   * When provided, this will be called instead of removing from the user set store.
   */
  onRemove?: () => void;
};

export function SetStatusMenu({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
  className,
  onRemove,
}: SetStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const normKey = setNumber.trim().toLowerCase();
  const status = useUserSetsStore(state => {
    const entry = state.sets[normKey];
    return entry?.status ?? EMPTY_SET_STATUS;
  });
  const setOwned = useUserSetsStore(state => state.setOwned);
  const clearAllStatusesForSet = useUserSetsStore(
    state => state.clearAllStatusesForSet
  );

  useEffect(() => {
    if (!open) return;
    const handleClickAway = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node | null;
      if (target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
    };
  }, [open]);

  const handleToggleOwned = () => {
    const nextOwned = !status.owned;
    setOwned({
      setNumber,
      owned: nextOwned,
      meta: {
        setNumber,
        name,
        year: typeof year === 'number' ? year : 0,
        imageUrl: imageUrl ?? null,
        numParts: typeof numParts === 'number' ? numParts : 0,
        themeId: typeof themeId === 'number' ? themeId : null,
      },
    });
  };

  const hasAnyStatus = status.owned;

  return (
    <div
      ref={rootRef}
      className={cn('pointer-events-auto relative inline-flex', className)}
      onClick={event => {
        // Prevent parent Link navigation when interacting with the menu.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-center text-foreground-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/60',
          hasAnyStatus && 'text-theme-primary'
        )}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(prev => !prev);
        }}
      >
        <MoreVertical size={20} />
      </button>
      {open && (
        <div className="absolute -top-4 right-0 z-20 mt-1 w-44 -translate-y-full overflow-hidden rounded-lg border border-subtle bg-card text-sm shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
            Collections
          </div>
          <RowButton
            size="sm"
            selected={status.owned}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              handleToggleOwned();
              setOpen(false);
            }}
          >
            <span>Owned</span>
          </RowButton>
          <RowButton
            size="sm"
            className="text-danger"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              if (onRemove) {
                onRemove();
              } else {
                clearAllStatusesForSet(setNumber);
              }
              setOpen(false);
            }}
          >
            <span>Remove</span>
          </RowButton>
        </div>
      )}
    </div>
  );
}
