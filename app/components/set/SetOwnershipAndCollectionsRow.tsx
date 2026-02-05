'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Modal } from '@/app/components/ui/Modal';
import { MoreDropdownButton } from '@/app/components/ui/MoreDropdown';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { Toast } from '@/app/components/ui/Toast';
import { cn } from '@/app/components/ui/utils';
import type { SetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { Check, ExternalLink, List, ListPlus, Plus, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

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
    toggleOwned,
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
  const [mobileToast, setMobileToast] = useState<{
    message: string;
    variant: 'success' | 'error';
  } | null>(null);
  const controlsDisabled = !isAuthenticated || isAuthenticating;
  const showAuthHint = !isAuthenticating && !isAuthenticated;

  // Auto-hide mobile toast after 2 seconds
  useEffect(() => {
    if (!mobileToast) return;
    const timer = setTimeout(() => setMobileToast(null), 2000);
    return () => clearTimeout(timer);
  }, [mobileToast]);

  const handleCreateCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    createList(trimmed);
    setNewCollectionName('');
  };

  const handleToggleOwned = () => {
    if (!isAuthenticated) return;
    const willBeOwned = !status.owned;
    toggleOwned();

    // Show toast on mobile (when label is hidden)
    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    if (isMobile) {
      setMobileToast(
        willBeOwned
          ? { message: 'You own this set!', variant: 'success' }
          : { message: 'Removed from owned sets', variant: 'error' }
      );
    }
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
          'status-row group flex transition-opacity',
          variant === 'default'
            ? 'mt-0 gap-1 border-t-2 border-subtle bg-background-muted/50 p-1.5'
            : variant === 'inline'
              ? 'mt-0 gap-2'
              : 'mt-0 flex-col gap-1',
          isAuthenticating && 'opacity-70',
          !isAuthenticated && !isAuthenticating && 'opacity-80',
          className
        )}
      >
        <StatusToggleButton
          icon={<Check className="size-3.5" />}
          label="Owned"
          active={isAuthenticated && status.owned}
          disabled={controlsDisabled}
          aria-busy={isAuthenticating}
          title={controlsDisabled ? 'Sign in to mark sets as owned' : undefined}
          onClick={handleToggleOwned}
          variant={variant === 'dropdown' ? 'dropdown' : variant}
          color="green"
          compact
          hideLabelOnMobile
          className="size-12 justify-center sm:h-12 sm:w-auto sm:justify-start sm:gap-2.5 sm:px-2.5 sm:pr-4"
        />
        <StatusToggleButton
          icon={<List className="size-3.5" />}
          label="Collections"
          hideIconOnMobile
          sublabel={selectedCollectionNames}
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
        <div className="bg-background-muted/50 px-3 py-1.5 text-xs font-medium text-foreground-muted">
          Sign in to track ownership and collections.
        </div>
      )}
      <Modal
        open={showCollections}
        title="Add to Collection"
        onClose={() => setShowCollections(false)}
      >
        <div className="flex flex-col gap-4">
          {listsLoading && sortedLists.length === 0 && (
            <div className="flex items-center justify-center py-4 text-sm text-foreground-muted">
              Loading collections…
            </div>
          )}
          {sortedLists.length > 0 && (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {sortedLists.map(collection => {
                const selected = selectedListIds.includes(collection.id);
                const Icon = collection.isSystem ? Star : ListPlus;
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
                      <Icon className="h-4 w-4 shrink-0" />
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
          {sortedLists.length === 0 && !listsLoading && (
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
      {mobileToast &&
        createPortal(
          <Toast
            description={mobileToast.message}
            variant={mobileToast.variant}
            onClose={() => setMobileToast(null)}
          />,
          document.body
        )}
    </>
  );
}
