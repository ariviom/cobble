'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { SetTabBar } from '@/app/components/set/SetTabBar';
import type { OpenTab } from '@/app/store/open-tabs';
import { Inventory } from '@/app/components/set/Inventory';
import { InventoryControls } from '@/app/components/set/InventoryControls';
import { InventoryProvider } from '@/app/components/set/InventoryProvider';
import type { InventoryRow } from '@/app/components/set/types';
import { Toast } from '@/app/components/ui/Toast';
import { cn } from '@/app/components/ui/utils';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import { useOrigin } from '@/app/hooks/useOrigin';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { addRecentSet } from '@/app/store/recent-sets';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SetPageClientProps = {
  setNumber: string;
  setName: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
  themeName?: string | null;
  /** Optional server-prefetched inventory rows for hydration. */
  initialInventory?: InventoryRow[] | null;
};

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

export function SetPageClient({
  setNumber,
  setName,
  year,
  imageUrl,
  numParts,
  themeId,
  themeName,
  initialInventory,
}: SetPageClientProps) {
  const [groupSession, setGroupSession] = useState<GroupSessionState>(null);
  const [currentParticipant, setCurrentParticipant] =
    useState<GroupParticipant | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [isSearchTogetherLoading, setIsSearchTogetherLoading] = useState(false);
  const [searchPartyError, setSearchPartyError] = useState<string | null>(null);

  const origin = useOrigin();
  const { user } = useSupabaseUser();
  const clientId = useGroupClientId();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  // Create a single tab for the current set (tab UI without tab management)
  const tabs: OpenTab[] = useMemo(
    () => [
      {
        type: 'set' as const,
        id: setNumber,
        name: setName,
        imageUrl,
        numParts,
        year,
        themeId: themeId ?? null,
        themeName: themeName ?? null,
      },
    ],
    [setNumber, setName, imageUrl, numParts, year, themeId, themeName]
  );

  // Add to recent sets on mount
  useEffect(() => {
    addRecentSet({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
      themeId: themeId ?? null,
      themeName: themeName ?? null,
    });
  }, [setNumber, setName, year, imageUrl, numParts, themeId, themeName]);

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
        body: JSON.stringify({ setNumber }),
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
        setNumber: data.session.setNumber ?? setNumber,
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
  }, [user, clientId, isSearchTogetherLoading, setNumber]);

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

  const showTabBar = tabs.length > 0;

  return (
    <InventoryProvider
      setNumber={setNumber}
      setName={setName}
      initialInventory={initialInventory ?? null}
      enableCloudSync
      groupSessionId={groupSession?.id ?? null}
      groupParticipantId={currentParticipant?.id ?? null}
      groupClientId={clientId}
      onParticipantPiecesDelta={handleParticipantPiecesDelta}
    >
      <div
        className={cn(
          'set-grid-layout min-h-[100dvh]',
          'lg:h-[calc(100dvh-var(--spacing-nav-offset))] lg:min-h-0 lg:overflow-hidden'
        )}
        data-has-tabs={showTabBar ? 'true' : 'false'}
      >
        {/* Mobile: sticky header | Desktop: lg:contents dissolves wrapper */}
        <header className="sticky top-0 z-60 col-span-full bg-card lg:contents">
          {showTabBar && (
            <SetTabBar
              tabs={tabs}
              activeTabId={setNumber}
              groupSessionSetNumber={groupSession?.setNumber ?? null}
            />
          )}
          <SetTopBar
            setNumber={setNumber}
            setName={setName}
            imageUrl={imageUrl}
            year={year}
            numParts={numParts}
            themeId={themeId ?? null}
            searchParty={{
              active: !!groupSession,
              loading: isSearchTogetherLoading || !clientId,
              canHost: !!user && !!clientId,
              joinUrl,
              participants,
              totalPiecesFound,
              currentParticipantId: currentParticipant?.id ?? null,
              onStart: handleStartSearchTogether,
              onEnd: handleEndSearchTogether,
            }}
          />
          <InventoryControls />
        </header>

        {/* Content - scrolls on desktop */}
        {/* Mobile: add padding-top to offset sticky header (topnav + controls) */}
        <main className="pt-[calc(var(--spacing-topnav-height)+var(--spacing-controls-height))] lg:col-start-2 lg:overflow-auto lg:pt-0">
          <Inventory />
        </main>

        {searchPartyError && (
          <Toast
            variant="error"
            description={searchPartyError}
            onClose={() => setSearchPartyError(null)}
          />
        )}
      </div>
    </InventoryProvider>
  );
}
