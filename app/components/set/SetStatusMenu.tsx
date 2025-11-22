'use client';

import { RowButton } from '@/app/components/ui/RowButton';
import { cn } from '@/app/components/ui/utils';
import {
  EMPTY_SET_STATUS,
  useUserSetsStore,
  type SetStatusKey,
} from '@/app/store/user-sets';
import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type SetStatusMenuProps = {
  setNumber: string;
  name: string;
  year?: number | undefined;
  imageUrl?: string | null | undefined;
  numParts?: number | undefined;
  themeId?: number | null | undefined;
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
  const setStatus = useUserSetsStore(state => state.setStatus);
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

  const handleToggle = (key: SetStatusKey) => {
    const nextValue = !status[key];
    setStatus({
      setNumber,
      key,
      value: nextValue,
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

  const hasAnyStatus = status.owned || status.canBuild || status.wantToBuild;

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
          'inline-flex items-center justify-center text-neutral-400 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary/60',
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
        <div className="absolute -top-4 right-0 z-20 mt-1 w-44 -translate-y-full overflow-hidden rounded-md border border-neutral-200 bg-white text-sm shadow-lg dark:bg-background">
          <div className="border-b px-3 py-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
            Set status
          </div>
          <RowButton
            size="sm"
            selected={status.owned}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              handleToggle('owned');
              setOpen(false);
            }}
          >
            <span>Owned</span>
          </RowButton>
          <RowButton
            size="sm"
            selected={status.canBuild}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              handleToggle('canBuild');
              setOpen(false);
            }}
          >
            <span>Can build</span>
          </RowButton>
          <RowButton
            size="sm"
            selected={status.wantToBuild}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              handleToggle('wantToBuild');
              setOpen(false);
            }}
          >
            <span>Want to build</span>
          </RowButton>
          <RowButton
            size="sm"
            className="text-brand-red"
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
