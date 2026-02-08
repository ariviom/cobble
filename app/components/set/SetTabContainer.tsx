'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { Inventory } from '@/app/components/set/Inventory';
import { InventoryControls } from '@/app/components/set/InventoryControls';
import {
  InventoryProvider,
  useInventoryData,
  useInventoryControls,
} from '@/app/components/set/InventoryProvider';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { Toast } from '@/app/components/ui/Toast';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import { useOrigin } from '@/app/hooks/useOrigin';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useSyncRecentSet } from '@/app/hooks/useSyncRecentSet';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { SetTab, TabViewState } from '@/app/store/open-tabs';
import { addRecentSet } from '@/app/store/recent-sets';

type GroupSessionState = {
  id: string;
  slug: string;
  setNumber: string;
  isActive: boolean;
} | null;

type GroupParticipant = {
  id: string;
  displayName: string;
  piecesFound: number;
};

type SetTabContainerProps = {
  tab: SetTab;
  isActive: boolean;
  savedScrollTop?: number;
  savedControlsState?: TabViewState;
  onSaveState: (state: Partial<TabViewState>) => void;
  /** Whether to use desktop scroll behavior */
  isDesktop?: boolean | undefined;
};

/**
 * Container for a single set tab.
 *
 * - When active: mounts children (SetTopBar, InventoryControls, Inventory)
 * - When inactive: hidden with display:none
 * - Scroll position is saved/restored on the Inventory grid wrapper
 */
export function SetTabContainer({
  tab,
  isActive,
  savedScrollTop,
  savedControlsState,
  onSaveState,
  isDesktop,
}: SetTabContainerProps) {
  const clientId = useGroupClientId();
  const origin = useOrigin();
  const { user } = useSupabaseUser();
  const syncRecentSet = useSyncRecentSet();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  // Search Party state
  const [groupSession, setGroupSession] = useState<GroupSessionState>(null);
  const [currentParticipant, setCurrentParticipant] =
    useState<GroupParticipant | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [isSearchTogetherLoading, setIsSearchTogetherLoading] = useState(false);
  const [searchPartyError, setSearchPartyError] = useState<string | null>(null);

  const joinUrl = useMemo(() => {
    if (!groupSession || !groupSession.slug) return null;
    if (!origin) return `/group/${groupSession.slug}`;
    return `${origin}/group/${groupSession.slug}`;
  }, [groupSession, origin]);

  const totalPiecesFound = useMemo(
    () => participants.reduce((sum, p) => sum + (p.piecesFound ?? 0), 0),
    [participants]
  );

  const handleStartSearchTogether = useCallback(async () => {
    if (!user) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return;
    }
    if (!clientId || isSearchTogetherLoading) return;

    try {
      setIsSearchTogetherLoading(true);

      const res = await fetch('/api/group-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ setNumber: tab.id }),
      });

      const data = (await res.json()) as {
        session?: {
          id: string;
          slug: string;
          setNumber: string;
          isActive: boolean;
        };
        error?: string;
        message?: string;
        limit?: number;
      };

      if (!res.ok || !data.session) {
        if (res.status === 429 && data.error === 'quota_exceeded') {
          setSearchPartyError(
            data.message ||
              `You've reached your limit of ${data.limit || 2} Search Party sessions this month.`
          );
        } else {
          setSearchPartyError(
            'Failed to start Search Party. Please try again.'
          );
        }
        return;
      }

      const created: GroupSessionState = {
        id: data.session.id,
        slug: data.session.slug,
        setNumber: data.session.setNumber ?? tab.id,
        isActive: data.session.isActive ?? true,
      };
      setGroupSession(created);

      const displayName =
        (user.user_metadata &&
          ((user.user_metadata.full_name as string | undefined) ||
            (user.user_metadata.name as string | undefined))) ||
        user.email ||
        'You';

      const joinRes = await fetch(
        `/api/group-sessions/${encodeURIComponent(created.slug)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName, clientToken: clientId }),
        }
      );

      const joinData = (await joinRes.json()) as {
        participant?: { id: string; displayName: string; piecesFound: number };
      };

      if (joinRes.ok && joinData.participant) {
        const hostParticipant: GroupParticipant = {
          id: joinData.participant.id,
          displayName: joinData.participant.displayName,
          piecesFound: joinData.participant.piecesFound ?? 0,
        };
        setCurrentParticipant(hostParticipant);
        setParticipants([hostParticipant]);
      }
    } catch {
      // Silently fail
    } finally {
      setIsSearchTogetherLoading(false);
    }
  }, [user, clientId, isSearchTogetherLoading, tab.id]);

  const handleEndSearchTogether = useCallback(async () => {
    if (!groupSession?.slug || !user) return;

    try {
      const res = await fetch(
        `/api/group-sessions/${encodeURIComponent(groupSession.slug)}/end`,
        { method: 'POST', credentials: 'same-origin' }
      );

      if (res.ok) {
        setGroupSession(null);
        setCurrentParticipant(null);
        setParticipants([]);
      }
    } catch {
      // Silently fail
    }
  }, [groupSession?.slug, user]);

  const handleParticipantPiecesDelta = useCallback(
    (participantId: string | null, delta: number) => {
      if (!participantId || delta === 0) return;
      setParticipants(prev =>
        prev.map(p =>
          p.id === participantId
            ? { ...p, piecesFound: Math.max(0, (p.piecesFound ?? 0) + delta) }
            : p
        )
      );
      setCurrentParticipant(prev =>
        prev && prev.id === participantId
          ? {
              ...prev,
              piecesFound: Math.max(0, (prev.piecesFound ?? 0) + delta),
            }
          : prev
      );
    },
    []
  );

  // Load and subscribe to participants
  useEffect(() => {
    if (!groupSession?.id) return;
    let cancelled = false;

    const loadParticipants = async () => {
      const { data, error } = await supabase
        .from('group_session_participants')
        .select('id, display_name, pieces_found')
        .eq('session_id', groupSession.id);

      if (cancelled || error || !Array.isArray(data)) return;
      setParticipants(
        data.map(row => ({
          id: row.id,
          displayName: row.display_name,
          piecesFound: row.pieces_found ?? 0,
        }))
      );
    };

    void loadParticipants();

    const channel = supabase
      .channel(`group_session_participants:${groupSession.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_session_participants',
          filter: `session_id=eq.${groupSession.id}`,
        },
        () => void loadParticipants()
      );

    try {
      channel.subscribe();
    } catch {
      /* best-effort */
    }

    const interval = window.setInterval(() => void loadParticipants(), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void channel.unsubscribe();
    };
  }, [groupSession?.id, supabase]);

  // Prepare searchParty prop for SetTopBar
  const searchPartyProp = useMemo(
    () => ({
      active: !!groupSession,
      loading: isSearchTogetherLoading || !clientId,
      canHost: !!user && !!clientId,
      joinUrl,
      participants,
      totalPiecesFound,
      currentParticipantId: currentParticipant?.id ?? null,
      onStart: handleStartSearchTogether,
      onEnd: handleEndSearchTogether,
    }),
    [
      groupSession,
      isSearchTogetherLoading,
      clientId,
      user,
      joinUrl,
      participants,
      totalPiecesFound,
      currentParticipant?.id,
      handleStartSearchTogether,
      handleEndSearchTogether,
    ]
  );

  // Add to recent sets when tab becomes active
  useEffect(() => {
    if (isActive) {
      addRecentSet({
        setNumber: tab.id,
        name: tab.name,
        year: tab.year,
        imageUrl: tab.imageUrl,
        numParts: tab.numParts,
        themeId: tab.themeId ?? null,
        themeName: tab.themeName ?? null,
      });
      syncRecentSet(tab.id);
    }
  }, [
    isActive,
    tab.id,
    tab.name,
    tab.year,
    tab.imageUrl,
    tab.numParts,
    tab.themeId,
    tab.themeName,
    syncRecentSet,
  ]);

  // Compute container style
  const containerStyle = useMemo(() => {
    if (isActive) {
      return { display: 'flex' };
    }
    return { display: 'none' };
  }, [isActive]);

  return (
    <>
      <div
        data-set-number={tab.id}
        data-active={isActive}
        style={containerStyle}
        className="tab-container flex-col lg:min-h-0 lg:flex-1"
      >
        <InventoryProvider
          setNumber={tab.id}
          setName={tab.name}
          initialControlsState={savedControlsState}
          enableCloudSync
          isActive={isActive}
          groupSessionId={groupSession?.id ?? null}
          groupParticipantId={currentParticipant?.id ?? null}
          groupClientId={clientId}
          onParticipantPiecesDelta={handleParticipantPiecesDelta}
        >
          <SetTabContainerContent
            tab={tab}
            isActive={isActive}
            onSaveState={onSaveState}
            savedScrollTop={savedScrollTop}
            isDesktop={isDesktop}
            searchParty={searchPartyProp}
          />
        </InventoryProvider>
      </div>

      {searchPartyError && (
        <Toast
          variant="error"
          description={searchPartyError}
          onClose={() => setSearchPartyError(null)}
        />
      )}
    </>
  );
}

type SetTabContainerContentProps = {
  tab: SetTab;
  isActive: boolean;
  onSaveState: (state: Partial<TabViewState>) => void;
  savedScrollTop?: number | undefined;
  isDesktop?: boolean | undefined;
  searchParty: {
    active: boolean;
    loading: boolean;
    canHost: boolean;
    joinUrl: string | null;
    participants: GroupParticipant[];
    totalPiecesFound: number;
    currentParticipantId: string | null;
    onStart: () => Promise<void> | void;
    onEnd: () => Promise<void> | void;
  };
};

function SetTabContainerContent({
  tab,
  isActive,
  onSaveState,
  savedScrollTop,
  isDesktop,
  searchParty,
}: SetTabContainerContentProps) {
  const { setNumber, isLoading, error } = useInventoryData();
  const { getControlsState } = useInventoryControls();
  const hasRestoredScroll = useRef(false);

  // Save controls state when tab becomes inactive (or on unmount as fallback)
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

  const prevActiveRef = useRef(isActive);
  useEffect(() => {
    // Save state when transitioning from active → inactive
    if (prevActiveRef.current && !isActive) {
      saveControlsState();
    }
    prevActiveRef.current = isActive;
  }, [isActive, saveControlsState]);

  // Fallback: save on unmount (e.g. tab closed)
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
          `[data-inventory-scroller="${setNumber}"]`
        );
        if (scroller) {
          scroller.scrollTop = savedScrollTop;
        }
      } else {
        window.scrollTo(0, savedScrollTop);
      }
    });
  }, [isLoading, savedScrollTop, isDesktop, setNumber]);

  // Render content - SetTopBar always visible, inventory shows loading/error/content
  return (
    <>
      {/* Top bar with set info - always visible, sticky on mobile */}
      <div className="sticky top-10 z-50 shrink-0 bg-card lg:static">
        <SetTopBar
          setNumber={tab.id}
          setName={tab.name}
          imageUrl={tab.imageUrl}
          year={tab.year}
          numParts={tab.numParts}
          themeId={tab.themeId ?? null}
          searchParty={searchParty}
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
