'use client';

import { CollectionsModalContent } from '@/app/components/collections/CollectionsModalContent';
import { Modal } from '@/app/components/ui/Modal';
import { MoreDropdownButton } from '@/app/components/ui/MoreDropdown';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { Toast } from '@/app/components/ui/Toast';
import { cn } from '@/app/components/ui/utils';
import type { SetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { Check, ExternalLink, List } from 'lucide-react';
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
    renameList,
    deleteList,
    isAuthenticating,
    isAuthenticated,
  } = ownership;

  const [showCollections, setShowCollections] = useState(false);
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
