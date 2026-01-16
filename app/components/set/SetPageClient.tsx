'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { SetTabBar } from '@/app/components/set/SetTabBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import type { InventoryRow } from '@/app/components/set/types';
import { Toast } from '@/app/components/ui/Toast';
import { cn } from '@/app/components/ui/utils';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import { useOpenTabs } from '@/app/hooks/useOpenTabs';
import { useOrigin } from '@/app/hooks/useOrigin';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { addRecentSet } from '@/app/store/recent-sets';
import { useEffect, useMemo, useState } from 'react';

type SetPageClientProps = {
  setNumber: string;
  setName: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
  themeName?: string | null;
  /** Optional server-prefetched inventory rows for hydration (not yet consumed). */
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
  initialInventory, // currently unused; placeholder for future hydration
}: SetPageClientProps) {
  const [groupSession, setGroupSession] = useState<GroupSessionState>(null);
  const [currentParticipant, setCurrentParticipant] =
    useState<GroupParticipant | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [isSearchTogetherLoading, setIsSearchTogetherLoading] = useState(false);
  const [searchPartyError, setSearchPartyError] = useState<string | null>(null);
  const [tabLimitError, setTabLimitError] = useState<string | null>(null);

  const origin = useOrigin();
  const { user } = useSupabaseUser();
  const clientId = useGroupClientId();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { tabs, add: addTab } = useOpenTabs();

  // Add to recent sets
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

  // Register as open tab
  useEffect(() => {
    const result = addTab({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
    });
    if (!result.success && result.reason === 'limit_reached') {
      setTabLimitError('Close a tab to open another set (max 8 tabs)');
    }
  }, [setNumber, setName, year, imageUrl, numParts, addTab]);

  const joinUrl = useMemo(() => {
    if (!groupSession || !groupSession.slug) return null;
    if (!origin) return `/group/${groupSession.slug}`;
    return `${origin}/group/${groupSession.slug}`;
  }, [groupSession, origin]);

  const totalPiecesFound = useMemo(
    () => participants.reduce((sum, p) => sum + (p.piecesFound ?? 0), 0),
    [participants]
  );

  async function handleStartSearchTogether() {
    if (!user) {
      // Enforce "no anonymous hosts" by nudging users to sign in first.
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return;
    }
    if (!clientId) return;
    if (isSearchTogetherLoading) return;

    try {
      setIsSearchTogetherLoading(true);

      const res = await fetch('/api/group-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        remaining?: number;
        resetAt?: string;
      };

      if (!res.ok || !data.session) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('SetPageClient: create group session failed', {
            status: res.status,
            body: data,
          });
        }

        // Handle quota exceeded error
        if (res.status === 429 && data.error === 'quota_exceeded') {
          setSearchPartyError(
            data.message ||
              `You've reached your limit of ${data.limit || 2} Search Party sessions this month. Upgrade to Plus for unlimited sessions.`
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
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName,
            clientToken: clientId,
          }),
        }
      );

      const joinData = (await joinRes.json()) as {
        session?: { id: string; setNumber: string };
        participant?: {
          id: string;
          displayName: string;
          piecesFound: number;
        };
        error?: string;
      };

      if (!joinRes.ok || !joinData.participant || !joinData.session) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('SetPageClient: join as host participant failed', {
            status: joinRes.status,
            body: joinData,
          });
        }
        return;
      }

      const hostParticipant: GroupParticipant = {
        id: joinData.participant.id,
        displayName: joinData.participant.displayName,
        piecesFound: joinData.participant.piecesFound ?? 0,
      };
      setCurrentParticipant(hostParticipant);
      setParticipants([hostParticipant]);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('SetPageClient: handleStartSearchTogether failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      setIsSearchTogetherLoading(false);
    }
  }

  async function handleEndSearchTogether() {
    if (!groupSession || !groupSession.slug) return;
    if (!user) return;

    try {
      const res = await fetch(
        `/api/group-sessions/${encodeURIComponent(groupSession.slug)}/end`,
        {
          method: 'POST',
          credentials: 'same-origin',
        }
      );

      if (!res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('SetPageClient: end group session failed', {
            status: res.status,
          });
        }
        return;
      }

      setGroupSession(null);
      setCurrentParticipant(null);
      setParticipants([]);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('SetPageClient: handleEndSearchTogether failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const handleParticipantPiecesDelta = (
    participantId: string | null,
    delta: number
  ) => {
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
  };

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
        () => {
          void loadParticipants();
        }
      );

    try {
      channel.subscribe();
    } catch {
      /* best-effort */
    }

    const interval = window.setInterval(() => {
      void loadParticipants();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void channel.unsubscribe();
    };
  }, [groupSession?.id, supabase]);

  const showTabBar = tabs.length > 0;

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col',
        'lg:set-grid-layout lg:h-[calc(100dvh-var(--spacing-nav-height))] lg:min-h-0 lg:pl-80 lg:set-grid-animated',
        'lg:set-grid-top-collapsed'
      )}
      data-has-tabs={showTabBar ? 'true' : 'false'}
    >
      {/* Header container: SetTopBar + SetTabBar share the first grid row on desktop */}
      <div className="contents lg:flex lg:flex-col">
        <SetTopBar
          setNumber={setNumber}
          setName={setName}
          imageUrl={imageUrl}
          year={year}
          numParts={numParts}
          themeId={themeId ?? null}
          {...(clientId
            ? {
                searchParty: {
                  active: !!groupSession,
                  loading: isSearchTogetherLoading,
                  canHost: !!user,
                  joinUrl,
                  participants,
                  totalPiecesFound,
                  currentParticipantId: currentParticipant?.id ?? null,
                  onStart: handleStartSearchTogether,
                  onEnd: handleEndSearchTogether,
                },
              }
            : {})}
        />
        {showTabBar && (
          <SetTabBar
            tabs={tabs}
            activeSetNumber={setNumber}
            groupSessionSetNumber={groupSession?.setNumber ?? null}
          />
        )}
      </div>
      <InventoryTable
        setNumber={setNumber}
        setName={setName}
        initialInventory={initialInventory ?? null}
        enableCloudSync
        groupSessionId={groupSession?.id ?? null}
        groupParticipantId={currentParticipant?.id ?? null}
        groupClientId={clientId}
        onParticipantPiecesDelta={handleParticipantPiecesDelta}
      />
      {searchPartyError && (
        <Toast
          variant="error"
          description={searchPartyError}
          onClose={() => setSearchPartyError(null)}
        />
      )}
      {tabLimitError && (
        <Toast
          variant="warning"
          description={tabLimitError}
          onClose={() => setTabLimitError(null)}
        />
      )}
    </div>
  );
}
