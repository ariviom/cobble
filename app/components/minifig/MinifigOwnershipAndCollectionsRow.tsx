'use client';

import { CollectionsModals } from '@/app/components/shared/CollectionsModals';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { Toast } from '@/app/components/ui/Toast';
import { cn } from '@/app/components/ui/utils';
import type { MinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { useOwnershipToast } from '@/app/hooks/useOwnershipToast';
import { Check, List } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const MINIFIG_TOAST_MESSAGES = {
  owned: 'Marked as owned!',
  removed: 'Removed from owned',
} as const;

type MinifigOwnershipAndCollectionsRowProps = {
  ownership: MinifigOwnershipState;
  variant?: 'default' | 'inline' | 'dropdown';
  className?: string;
};

export function MinifigOwnershipAndCollectionsRow({
  ownership,
  variant = 'default',
  className,
}: MinifigOwnershipAndCollectionsRowProps) {
  const {
    status,
    toggleOwned,
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
    showListUpgradeModal,
    dismissListUpgradeModal,
  } = ownership;

  const [showCollections, setShowCollections] = useState(false);
  const controlsDisabled = !isAuthenticated || isAuthenticating;
  const showAuthHint = !isAuthenticating && !isAuthenticated;

  const { mobileToast, clearMobileToast, handleToggleOwned } =
    useOwnershipToast(status.owned, toggleOwned, MINIFIG_TOAST_MESSAGES);

  const wrappedToggleOwned = () => {
    if (!isAuthenticated) return;
    handleToggleOwned();
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
          title={
            controlsDisabled
              ? 'Sign in to mark minifigures as owned'
              : undefined
          }
          onClick={wrappedToggleOwned}
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
              ? 'Sign in to organize minifigures in collections'
              : undefined
          }
          onClick={handleOpenCollections}
          variant={variant === 'dropdown' ? 'dropdown' : variant}
          color="blue"
        />
      </div>
      {showAuthHint && variant !== 'inline' && (
        <div className="bg-background-muted/50 px-3 py-1.5 text-xs font-medium text-foreground-muted">
          Sign in to track ownership and collections.
        </div>
      )}
      <CollectionsModals
        isOpen={showCollections}
        onClose={() => setShowCollections(false)}
        lists={lists}
        selectedListIds={selectedListIds}
        listsLoading={listsLoading}
        listsError={listsError}
        toggleList={toggleList}
        createList={createList}
        renameList={renameList}
        deleteList={deleteList}
        showListUpgradeModal={showListUpgradeModal}
        dismissListUpgradeModal={dismissListUpgradeModal}
      />
      {mobileToast &&
        createPortal(
          <Toast
            description={mobileToast.message}
            variant={mobileToast.variant}
            onClose={clearMobileToast}
          />,
          document.body
        )}
    </>
  );
}
