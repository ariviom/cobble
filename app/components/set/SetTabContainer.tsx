'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/app/components/ui/utils';
import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { Inventory } from '@/app/components/set/Inventory';
import { InventoryControls } from '@/app/components/set/InventoryControls';
import {
  InventoryProvider,
  useInventoryData,
  useInventoryControls,
} from '@/app/components/set/InventoryProvider';
import { SearchPartyProvider } from '@/app/components/set/SearchPartyProvider';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { Toast } from '@/app/components/ui/Toast';
import type { GroupParticipant } from '@/app/hooks/useGroupParticipants';
import { useSearchPartyChannel } from '@/app/hooks/useSearchPartyChannel';
import { useSearchPartySession } from '@/app/hooks/useSearchPartySession';
import type { SetTab, TabViewState } from '@/app/store/open-tabs';

type SetTabContainerProps = {
  tab: SetTab;
  isActive: boolean;
  savedScrollTop?: number;
  savedControlsState?: TabViewState;
  onSaveState: (state: Partial<TabViewState>) => void;
  /** Whether to use desktop scroll behavior */
  isDesktop?: boolean | undefined;
  /** Host close confirmation — set to true when host requests closing this SP tab */
  closeRequested?: boolean;
  /** Called when host confirms ending the session and closing the tab */
  onConfirmClose?: (id: string) => void;
  /** Called when host cancels the close */
  onCancelClose?: () => void;
};

/**
 * Container for a single set tab.
 *
 * - InventoryProvider is always mounted (hook state persists across tab switches)
 * - When active: visual content (SetTopBar, InventoryControls, Inventory) is rendered
 * - When inactive: container hidden with display:none, visual content unmounted
 * - Scroll position is saved/restored on the Inventory grid wrapper
 */
export function SetTabContainer({
  tab,
  isActive,
  savedScrollTop,
  savedControlsState,
  onSaveState,
  isDesktop,
  closeRequested,
  onConfirmClose,
  onCancelClose,
}: SetTabContainerProps) {
  const sp = useSearchPartySession(tab, isActive);
  const [searchPartyModalOpen, setSearchPartyModalOpen] = useState(false);

  const spChannel = useSearchPartyChannel({
    groupSessionId: sp.groupSession?.id ?? null,
    groupParticipantId: sp.currentParticipant?.id ?? null,
    groupParticipantDisplayName: sp.currentParticipant?.displayName ?? null,
    groupClientId: sp.groupClientId,
    setNumber: tab.setNumber,
    enableCloudSync: !sp.isJoiner,
    isJoiner: sp.isJoiner,
    piecesFoundRef: sp.piecesFoundRef,
    onParticipantPiecesDelta: sp.handleParticipantPiecesDelta,
    onParticipantJoined: sp.handleParticipantJoined,
    onParticipantLeft: sp.handleParticipantLeft,
    onSessionEnded: sp.handleSessionEnded,
    broadcastSessionEndedRef: sp.broadcastSessionEndedRef,
    broadcastParticipantRemovedRef: sp.broadcastParticipantRemovedRef,
  });

  const containerStyle = useMemo(
    () => (isActive ? { display: 'flex' } : { display: 'none' }),
    [isActive]
  );

  return (
    <>
      <div
        data-set-number={tab.setNumber}
        data-active={isActive}
        style={containerStyle}
        className="tab-container flex-col lg:min-h-0 lg:flex-1"
      >
        <SearchPartyProvider value={spChannel.context}>
          <InventoryProvider
            setNumber={tab.setNumber}
            setName={tab.name}
            scrollerKey={tab.id}
            initialControlsState={savedControlsState}
            enableCloudSync={!sp.isJoiner}
            ownedOverride={spChannel.inventoryProps.ownedOverride}
            onAfterOwnedChange={spChannel.inventoryProps.onAfterOwnedChange}
            ownedByKeyRef={spChannel.inventoryProps.ownedByKeyRef}
            applyOwnedRef={spChannel.inventoryProps.applyOwnedRef}
            isActive={isActive}
          >
            {isActive ? (
              <SetTabContainerContent
                tab={tab}
                onSaveState={onSaveState}
                savedScrollTop={savedScrollTop}
                isDesktop={isDesktop}
                searchParty={sp.searchPartyProp}
                searchPartyModalOpen={searchPartyModalOpen}
                setSearchPartyModalOpen={setSearchPartyModalOpen}
              />
            ) : null}
          </InventoryProvider>
        </SearchPartyProvider>
      </div>

      {sp.searchPartyError && (
        <Toast
          variant="error"
          description={sp.searchPartyError}
          onClose={sp.clearSearchPartyError}
        />
      )}

      <Modal
        open={sp.sessionEndedModalOpen}
        onClose={sp.handleSessionEndedDismiss}
        title="Session Ended"
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">
            This Search Party session has ended.
          </p>
          <Button onClick={sp.handleSessionEndedDismiss}>OK</Button>
        </div>
      </Modal>

      <Modal
        open={!!closeRequested}
        onClose={() => onCancelClose?.()}
        title="End Search Party?"
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">
            Closing this tab will end the session for all participants.
          </p>
          {sp.participants.length > 0 && (
            <ul className="space-y-2">
              {sp.participants.map(p => {
                const connected =
                  Date.now() - new Date(p.lastSeenAt).getTime() < 2 * 60_000;
                return (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        'size-2 flex-shrink-0 rounded-full',
                        connected ? 'bg-success' : 'bg-foreground/20'
                      )}
                    />
                    <span className="text-foreground">{p.displayName}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={async () => {
                await sp.searchPartyProp.onEnd();
                onConfirmClose?.(tab.id);
              }}
            >
              End Session
            </Button>
            <Button variant="outline" onClick={() => onCancelClose?.()}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

type SetTabContainerContentProps = {
  tab: SetTab;
  onSaveState: (state: Partial<TabViewState>) => void;
  savedScrollTop?: number | undefined;
  isDesktop?: boolean | undefined;
  searchParty: {
    active: boolean;
    loading: boolean;
    canHost: boolean;
    isHost: boolean;
    joinUrl: string | null;
    participants: GroupParticipant[];
    totalPiecesFound: number;
    currentParticipantId: string | null;
    slug: string | null;
    onStart: () => Promise<void> | void;
    onEnd: () => Promise<void> | void;
    onContinue: (slug: string) => Promise<void> | void;
    onRemoveParticipant: (participantId: string) => void;
  };
  searchPartyModalOpen: boolean;
  setSearchPartyModalOpen: (open: boolean) => void;
};

function SetTabContainerContent({
  tab,
  onSaveState,
  savedScrollTop,
  isDesktop,
  searchParty,
  searchPartyModalOpen,
  setSearchPartyModalOpen,
}: SetTabContainerContentProps) {
  const { scrollerKey, isLoading, error } = useInventoryData();
  const { getControlsState } = useInventoryControls();
  const hasRestoredScroll = useRef(false);

  const getControlsStateRef = useRef(getControlsState);
  getControlsStateRef.current = getControlsState;

  const onSaveStateRef = useRef(onSaveState);
  onSaveStateRef.current = onSaveState;

  const saveControlsState = useCallback(() => {
    const state = getControlsStateRef.current();
    onSaveStateRef.current({
      filter: state.filter,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      view: state.view,
      itemSize: state.itemSize,
      groupBy: state.groupBy,
    });
  }, []);

  // Save controls state on unmount (tab switch or tab close)
  useEffect(() => {
    return () => {
      saveControlsState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore scroll position after inventory loads
  useEffect(() => {
    if (isLoading) return;
    if (hasRestoredScroll.current) return;
    if (typeof savedScrollTop !== 'number') return;

    hasRestoredScroll.current = true;

    // Use requestAnimationFrame to ensure Inventory has rendered
    requestAnimationFrame(() => {
      if (isDesktop) {
        const scroller = document.querySelector(
          `[data-inventory-scroller="${scrollerKey}"]`
        );
        if (scroller) {
          scroller.scrollTop = savedScrollTop;
        }
      } else {
        window.scrollTo(0, savedScrollTop);
      }
    });
  }, [isLoading, savedScrollTop, isDesktop, scrollerKey]);

  // Render content - SetTopBar always visible, inventory shows loading/error/content
  return (
    <>
      {/* Top bar with set info - always visible, sticky on mobile */}
      <div className="sticky top-10 z-50 shrink-0 bg-card lg:static">
        <SetTopBar
          setNumber={tab.setNumber}
          setName={tab.name}
          imageUrl={tab.imageUrl}
          year={tab.year}
          numParts={tab.numParts}
          themeId={tab.themeId ?? null}
          searchParty={searchParty}
          searchPartyModalOpen={searchPartyModalOpen}
          setSearchPartyModalOpen={setSearchPartyModalOpen}
        />
        <InventoryControls isLoading={isLoading} />
      </div>

      {/* Inventory content */}
      {isLoading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <BrickLoader />
        </div>
      ) : error ? (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-foreground-muted">Failed to load set inventory</p>
          <p className="text-sm text-foreground-muted">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      ) : (
        <Inventory />
      )}
    </>
  );
}
