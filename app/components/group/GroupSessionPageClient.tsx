'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import { cn } from '@/app/components/ui/utils';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import { useOrigin } from '@/app/hooks/useOrigin';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useEffect, useMemo, useState } from 'react';

type GroupSessionPageClientProps = {
  sessionId: string;
  slug: string;
  setNumber: string;
  setName: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
};

type GroupParticipant = {
  id: string;
  displayName: string;
  piecesFound: number;
};

export function GroupSessionPageClient({
  sessionId,
  slug,
  setNumber,
  setName,
  year,
  imageUrl,
  numParts,
  themeId,
}: GroupSessionPageClientProps) {
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [currentParticipant, setCurrentParticipant] =
    useState<GroupParticipant | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);

  const origin = useOrigin();
  const clientId = useGroupClientId();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  // Restore display name from localStorage for returning participants
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(
        `brick_party_group_session_name_${slug}`
      );
      if (stored && typeof stored === 'string') {
        setDisplayNameInput(stored);
      }
    } catch {
      // ignore
    }
  }, [slug]);

  const joinUrl = useMemo(() => {
    if (!slug) return null;
    if (!origin) return `/group/${slug}`;
    return `${origin}/group/${slug}`;
  }, [slug, origin]);

  const totalPiecesFound = useMemo(
    () => participants.reduce((sum, p) => sum + (p.piecesFound ?? 0), 0),
    [participants]
  );

  const handleJoin = async () => {
    if (!clientId) return;
    const name = displayNameInput.trim();
    if (!name) return;
    if (isJoining || currentParticipant) return;

    setIsJoining(true);
    try {
      const res = await fetch(
        `/api/group-sessions/${encodeURIComponent(slug)}/join`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName: name,
            clientToken: clientId,
          }),
        }
      );

      const data = (await res.json()) as {
        session?: { id: string; setNumber: string };
        participant?: { id: string; displayName: string; piecesFound: number };
        error?: string;
      };

      if (!res.ok || !data.participant || !data.session) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('GroupSessionPageClient: join failed', {
            status: res.status,
            body: data,
          });
        }
        return;
      }

      const participant: GroupParticipant = {
        id: data.participant.id,
        displayName: data.participant.displayName,
        piecesFound: data.participant.piecesFound ?? 0,
      };
      setCurrentParticipant(participant);

      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            `brick_party_group_session_name_${slug}`,
            name
          );
        }
      } catch {
        // ignore
      }

      const supabase = getSupabaseBrowserClient();
      const { data: roster, error: rosterError } = await supabase
        .from('group_session_participants')
        .select('id, display_name, pieces_found')
        .eq('session_id', sessionId);

      if (!rosterError && Array.isArray(roster)) {
        setParticipants(
          roster.map(row => ({
            id: row.id,
            displayName: row.display_name,
            piecesFound: row.pieces_found ?? 0,
          }))
        );
      } else {
        setParticipants([participant]);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('GroupSessionPageClient: handleJoin failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      setIsJoining(false);
    }
  };

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

  const hasJoined = !!currentParticipant && !!clientId;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const loadParticipants = async () => {
      const { data, error } = await supabase
        .from('group_session_participants')
        .select('id, display_name, pieces_found')
        .eq('session_id', sessionId);

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
      .channel(`group_session_participants:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_session_participants',
          filter: `session_id=eq.${sessionId}`,
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
  }, [sessionId, supabase]);

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
        // Participants joining via link are not hosts; they see read-only
        // Search Party stats in the top bar.
        searchParty={{
          active: hasJoined,
          loading: isJoining,
          canHost: false,
          joinUrl,
          participants,
          totalPiecesFound,
          onStart: () => {},
          onEnd: () => {},
        }}
      />
      {!hasJoined ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm rounded-md border border-subtle bg-card p-4 text-xs">
            <h1 className="text-sm font-semibold text-foreground">
              Join this Search Party session
            </h1>
            <p className="mt-2 text-foreground-muted">
              Enter a name so others can see who&apos;s helping search this set.
              We&apos;ll remember it on this device so you stay recognized if
              you disconnect and rejoin.
            </p>
            <label className="mt-4 block text-[11px] font-medium text-foreground">
              Name
            </label>
            <input
              type="text"
              value={displayNameInput}
              onChange={event => setDisplayNameInput(event.target.value)}
              className="mt-1 w-full rounded-md border border-subtle bg-background px-2 py-1 text-xs"
              placeholder="e.g., Alice, Living room, iPad"
            />
            <button
              type="button"
              className="mt-4 inline-flex h-8 w-full items-center justify-center rounded-md bg-theme-primary px-3 text-[11px] font-medium text-white hover:bg-theme-primary/90 disabled:opacity-60"
              onClick={() => void handleJoin()}
              disabled={isJoining || !displayNameInput.trim() || !clientId}
            >
              {isJoining ? 'Joining…' : 'Join session'}
            </button>
          </div>
        </div>
      ) : (
        <InventoryTable
          setNumber={setNumber}
          setName={setName}
          enableCloudSync={false}
          groupSessionId={sessionId}
          groupParticipantId={currentParticipant?.id ?? null}
          groupClientId={clientId}
          onParticipantPiecesDelta={handleParticipantPiecesDelta}
        />
      )}
    </div>
  );
}
