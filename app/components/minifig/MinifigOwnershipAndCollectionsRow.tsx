'use client';

import { CollectionsModalContent } from '@/app/components/collections/CollectionsModalContent';
import { Modal } from '@/app/components/ui/Modal';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { cn } from '@/app/components/ui/utils';
import type { MinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { Check, Heart } from 'lucide-react';
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
    renameList,
    deleteList,
    isAuthenticating,
    isAuthenticated,
  } = ownership;

  const [showCollections, setShowCollections] = useState(false);
  const controlsDisabled = !isAuthenticated || isAuthenticating;
  const showAuthHint = !isAuthenticating && !isAuthenticated;

  const handleToggleStatus = (key: 'owned' | 'want') => {
    if (!isAuthenticated) return;
    toggleStatus(key);
  };

  const handleOpenCollections = () => {
    if (!isAuthenticated) return;
    setShowCollections(true);
  };

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
        <CollectionsModalContent
          lists={lists}
          selectedListIds={selectedListIds}
          isLoading={listsLoading}
          error={listsError}
          onToggle={toggleList}
          onCreate={createList}
          onRename={renameList}
          onDelete={deleteList}
        />
      </Modal>
    </>
  );
}
