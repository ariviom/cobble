'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import { cn } from '@/app/components/ui/utils';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
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
}: SetPageClientProps) {
  const [groupSession, setGroupSession] = useState<GroupSessionState>(null);
  const [currentParticipant, setCurrentParticipant] =
    useState<GroupParticipant | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [isSearchTogetherLoading, setIsSearchTogetherLoading] = useState(false);
  const [origin, setOrigin] = useState('');

  const { user } = useSupabaseUser();
  const clientId = useGroupClientId();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

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
      };

      if (!res.ok || !data.session) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('SetPageClient: create group session failed', {
            status: res.status,
            body: data,
          });
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

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col',
        'lg:set-grid-layout lg:h-[calc(100dvh-var(--spacing-nav-height))] lg:min-h-0 lg:pl-80 lg:set-grid-animated',
        'lg:set-grid-top-collapsed'
      )}
    >
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
      <InventoryTable
        setNumber={setNumber}
        setName={setName}
        enableCloudSync
        groupSessionId={groupSession?.id ?? null}
        groupParticipantId={currentParticipant?.id ?? null}
        groupClientId={clientId}
        onParticipantPiecesDelta={handleParticipantPiecesDelta}
      />
    </div>
  );
}
