'use client';

import { Modal } from '@/app/components/ui/Modal';
import { MoreDropdownButton } from '@/app/components/ui/MoreDropdown';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { cn } from '@/app/components/ui/utils';
import type { SetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { Check, ExternalLink, Heart, ListPlus, Plus } from 'lucide-react';
import { useState } from 'react';

type SetOwnershipAndCollectionsRowProps = {
  ownership: SetOwnershipState;
  variant?: 'default' | 'inline' | 'dropdown';
  className?: string;
  bricklinkUrl?: string | null;
};

export function SetOwnershipAndCollectionsRow({
  className,
  ownership,
  variant = 'default',
  bricklinkUrl,
}: SetOwnershipAndCollectionsRowProps) {
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

  const handleToggleStatus = (key: 'owned' | 'wantToBuild') => {
    if (!isAuthenticated) return;
    toggleStatus(key);
  };

  const handleOpenCollections = () => {
    if (!isAuthenticated) return;
    setShowCollections(true);
  };

  return (
    <>
      <div
        className={cn(
          'status-row group flex text-xs transition-opacity',
          variant === 'default'
            ? 'mt-2 border-t border-subtle'
            : variant === 'inline'
              ? 'mt-0 gap-2'
              : 'mt-0 flex-col',
          isAuthenticating && 'opacity-70',
          !isAuthenticated && !isAuthenticating && 'opacity-80',
          className
        )}
      >
        <StatusToggleButton
          icon={<Check className="size-4" />}
          label="Owned"
          active={isAuthenticated && status.owned}
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={controlsDisabled ? 'Sign in to mark sets as owned' : undefined}
          onClick={() => handleToggleStatus('owned')}
          variant={variant === 'dropdown' ? 'dropdown' : variant}
        />
        {variant === 'dropdown' && <div className="h-px bg-subtle" />}
        <StatusToggleButton
          icon={<Heart className="size-4" />}
          label="Wishlist"
          active={isAuthenticated && status.wantToBuild}
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={
            controlsDisabled
              ? 'Sign in to add sets to your wishlist'
              : undefined
          }
          onClick={() => handleToggleStatus('wantToBuild')}
          variant={variant === 'dropdown' ? 'dropdown' : variant}
        />
        {variant === 'dropdown' && <div className="h-px bg-subtle" />}
        <StatusToggleButton
          icon={<Plus className="size-4" />}
          label="List"
          className={variant !== 'dropdown' ? 'ml-auto' : undefined}
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={
            controlsDisabled
              ? 'Sign in to organize sets in collections'
              : undefined
          }
          onClick={handleOpenCollections}
          variant={variant === 'dropdown' ? 'dropdown' : variant}
        />
        {variant === 'dropdown' && bricklinkUrl && (
          <>
            <div className="h-px bg-subtle" />
            <MoreDropdownButton
              icon={<ExternalLink className="size-4" />}
              label="View on BrickLink"
              href={bricklinkUrl}
              target="_blank"
              rel="noreferrer noopener"
            />
          </>
        )}
      </div>
      {showAuthHint && (
        <div className="mt-1 text-[11px] text-foreground-muted">
          Sign in to track ownership and collections.
        </div>
      )}
      <Modal
        open={showCollections}
        title="Collections"
        onClose={() => setShowCollections(false)}
      >
        <div className="flex flex-col gap-2 text-xs">
          {listsLoading && lists.length === 0 && (
            <div className="text-[10px] text-foreground-muted">Loading…</div>
          )}
          {lists.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {lists.map(collection => {
                const selected = selectedListIds.includes(collection.id);
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
                      <ListPlus className="h-3 w-3" />
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
              <Plus className="h-3 w-3" />
              <span>Create</span>
            </button>
          </div>
          {listsError && (
            <div className="mt-1 text-[10px] text-brand-red">{listsError}</div>
          )}
        </div>
      </Modal>
    </>
  );
}
