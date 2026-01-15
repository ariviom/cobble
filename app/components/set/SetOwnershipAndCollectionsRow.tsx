'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
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
          'status-row group flex transition-opacity',
          variant === 'default'
            ? 'mt-0 gap-1.5 border-t-2 border-subtle bg-background-muted/50 p-2'
            : variant === 'inline'
              ? 'mt-0 gap-2'
              : 'mt-0 flex-col gap-1',
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
          color="green"
        />
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
          color="orange"
        />
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
          color="blue"
        />
        {variant === 'dropdown' && bricklinkUrl && (
          <MoreDropdownButton
            icon={<ExternalLink className="size-4" />}
            label="View on BrickLink"
            href={bricklinkUrl}
            target="_blank"
            rel="noreferrer noopener"
          />
        )}
      </div>
      {showAuthHint && (
        <div className="bg-background-muted/50 px-4 py-2 text-sm font-medium text-foreground-muted">
          Sign in to track ownership and collections.
        </div>
      )}
      <Modal
        open={showCollections}
        title="Add to Collection"
        onClose={() => setShowCollections(false)}
      >
        <div className="flex flex-col gap-4">
          {listsLoading && lists.length === 0 && (
            <div className="flex items-center justify-center py-4 text-sm text-foreground-muted">
              Loading collections…
            </div>
          )}
          {lists.length > 0 && (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {lists.map(collection => {
                const selected = selectedListIds.includes(collection.id);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    className={cn(
                      'flex items-center justify-between rounded-md border-2 px-4 py-3 text-left text-sm font-bold transition-all duration-150',
                      selected
                        ? 'border-brand-blue bg-brand-blue/10 text-brand-blue shadow-[0_2px_0_0] shadow-brand-blue/20'
                        : 'border-subtle bg-card text-foreground hover:-translate-y-0.5 hover:bg-background-muted hover:shadow-sm'
                    )}
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleList(collection.id);
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <ListPlus className="h-4 w-4 shrink-0" />
                      <span className="truncate">{collection.name}</span>
                    </span>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-brand-blue" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {lists.length === 0 && !listsLoading && (
            <div className="py-4 text-center text-sm text-foreground-muted">
              No collections yet. Create one below!
            </div>
          )}
          <div className="flex items-end gap-2 border-t-2 border-subtle pt-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-bold tracking-wide text-foreground-muted uppercase">
                New Collection
              </label>
              <Input
                value={newCollectionName}
                onChange={event => setNewCollectionName(event.target.value)}
                placeholder="Collection name"
                size="md"
              />
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleCreateCollection();
              }}
              disabled={!newCollectionName.trim()}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
          {listsError && (
            <div className="rounded-md border-2 border-danger/30 bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
              {listsError}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
