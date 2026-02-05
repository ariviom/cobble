'use client';

import { Modal } from '@/app/components/ui/Modal';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { cn } from '@/app/components/ui/utils';
import type { MinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { Check, Heart, ListPlus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';

type MinifigOwnershipAndCollectionsRowProps = {
  ownership: MinifigOwnershipState;
  className?: string;
};

export function MinifigOwnershipAndCollectionsRow({
  ownership,
  className,
}: MinifigOwnershipAndCollectionsRowProps) {
  const {
    status,
    toggleStatus,
    lists,
    selectedListIds,
    listsLoading,
    listsError,
    toggleList,
    createList,
    isAuthenticating,
    isAuthenticated,
  } = ownership;

  const [showCollections, setShowCollections] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const controlsDisabled = !isAuthenticated || isAuthenticating;
  const showAuthHint = !isAuthenticating && !isAuthenticated;

  const handleCreateCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    createList(trimmed);
    setNewCollectionName('');
  };

  const handleToggleStatus = (key: 'owned' | 'want') => {
    if (!isAuthenticated) return;
    toggleStatus(key);
  };

  const handleOpenCollections = () => {
    if (!isAuthenticated) return;
    setShowCollections(true);
  };

  // Sort lists: system lists (like Wishlist) first, then custom lists alphabetically
  const sortedLists = useMemo(() => {
    const system = lists.filter(l => l.isSystem);
    const custom = lists.filter(l => !l.isSystem);
    return [...system, ...custom];
  }, [lists]);

  // Build sublabel showing selected collection names
  const selectedCollectionNames = useMemo(() => {
    if (selectedListIds.length === 0) return null;
    const names = lists
      .filter(l => selectedListIds.includes(l.id))
      .map(l => l.name);
    if (names.length === 0) return null;
    return names.join(', ');
  }, [lists, selectedListIds]);

  return (
    <>
      <div
        className={cn(
          'status-row mt-2 flex items-center gap-2 text-xs',
          isAuthenticating && 'opacity-70',
          !isAuthenticated && !isAuthenticating && 'opacity-80',
          className
        )}
      >
        <StatusToggleButton
          icon={<Check className="size-4" />}
          label="Owned"
          active={isAuthenticated && status === 'owned'}
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={
            controlsDisabled
              ? 'Sign in to mark minifigures as owned'
              : undefined
          }
          onClick={() => handleToggleStatus('owned')}
          variant="inline"
          compact
          className="pr-4"
        />
        <StatusToggleButton
          icon={<Heart className="size-4" />}
          label="Wishlist"
          active={isAuthenticated && status === 'want'}
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={
            controlsDisabled
              ? 'Sign in to add minifigures to your wishlist'
              : undefined
          }
          onClick={() => handleToggleStatus('want')}
          variant="inline"
          compact
          className="pr-4"
        />
        <StatusToggleButton
          label="Collection"
          sublabel={selectedCollectionNames}
          showChevron
          className="ml-auto"
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={
            controlsDisabled
              ? 'Sign in to organize minifigures in collections'
              : undefined
          }
          onClick={handleOpenCollections}
          variant="inline"
        />
      </div>
      {showAuthHint && (
        <div className="text-2xs mt-1 text-foreground-muted">
          Sign in to track minifigure ownership and lists.
        </div>
      )}
      <Modal
        open={showCollections}
        title="Collections"
        onClose={() => setShowCollections(false)}
      >
        <div className="flex flex-col gap-2 text-xs">
          {listsLoading && sortedLists.length === 0 && (
            <div className="text-2xs text-foreground-muted">Loading…</div>
          )}
          {sortedLists.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {sortedLists.map(collection => {
                const selected = selectedListIds.includes(collection.id);
                const Icon = collection.isSystem ? Star : ListPlus;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left text-xs',
                      'hover:bg-card-muted',
                      selected && 'bg-theme-primary/5 text-theme-primary'
                    )}
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleList(collection.id);
                    }}
                  >
                    <span className="flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      <span className="truncate">{collection.name}</span>
                    </span>
                    {selected && (
                      <Check className="h-3 w-3 shrink-0 text-theme-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1">
            <input
              type="text"
              value={newCollectionName}
              onChange={event => setNewCollectionName(event.target.value)}
              placeholder="New collection name"
              className="flex-1 rounded border border-subtle bg-card px-2 py-1 text-xs"
            />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-subtle bg-card px-2 py-1 text-xs hover:bg-card-muted"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleCreateCollection();
              }}
            >
              <ListPlus className="h-3 w-3" />
              <span>Create</span>
            </button>
          </div>
          {listsError && (
            <div className="text-2xs mt-1 text-brand-red">{listsError}</div>
          )}
        </div>
      </Modal>
    </>
  );
}
