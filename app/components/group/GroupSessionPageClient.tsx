'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { Inventory } from '@/app/components/set/Inventory';
import { InventoryControls } from '@/app/components/set/InventoryControls';
import { InventoryProvider } from '@/app/components/set/InventoryProvider';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Toast } from '@/app/components/ui/Toast';
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
  const [joinError, setJoinError] = useState<string | null>(null);
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
        message?: string;
      };

      if (!res.ok || !data.participant || !data.session) {
        let msg: string;
        if (data.error === 'session_full') {
          msg = 'This session is full (max 8 participants).';
        } else if (data.error === 'not_found') {
          msg = "This session has ended or doesn't exist.";
        } else if (res.status === 429) {
          msg = data.message ?? 'Too many attempts, please wait.';
        } else {
          msg = 'Failed to join. Please try again.';
        }
        setJoinError(msg);
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

  // Wrap in InventoryProvider when joined so controls work
  const content = hasJoined ? (
    <InventoryProvider
      setNumber={setNumber}
      setName={setName}
      enableCloudSync={false}
      groupSessionId={sessionId}
      groupParticipantId={currentParticipant?.id ?? null}
      groupClientId={clientId}
      onParticipantPiecesDelta={handleParticipantPiecesDelta}
    >
      <div
        className={cn(
          'set-grid-layout min-h-[100dvh]',
          'lg:h-[calc(100dvh-var(--spacing-nav-offset))] lg:overflow-hidden'
        )}
      >
        {/* Mobile: sticky header | Desktop: lg:contents dissolves wrapper */}
        <header className="sticky top-0 z-60 col-span-full bg-card lg:contents">
          <SetTopBar
            setNumber={setNumber}
            setName={setName}
            imageUrl={imageUrl}
            year={year}
            numParts={numParts}
            themeId={themeId ?? null}
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
          <InventoryControls />
        </header>

        {/* Content - scrolls on desktop, needs bottom padding for mobile nav */}
        <main className="pt-[calc(var(--grid-row-tabs,0px)+var(--spacing-topnav-height)+var(--spacing-controls-height))] pb-[var(--spacing-nav-height)] lg:col-start-2 lg:overflow-auto lg:pt-0 lg:pb-0">
          <Inventory />
        </main>
      </div>
    </InventoryProvider>
  ) : (
    <div
      className={cn(
        'flex h-[calc(100dvh-var(--spacing-nav-height))] flex-col overflow-hidden',
        'lg:h-[calc(100dvh-var(--spacing-nav-offset))]'
      )}
    >
      <SetTopBar
        setNumber={setNumber}
        setName={setName}
        imageUrl={imageUrl}
        year={year}
        numParts={numParts}
        themeId={themeId ?? null}
        hideMoreMenu
        searchParty={{
          active: hasJoined,
          loading: isJoining,
          canHost: false,
          joinUrl,
          participants,
          totalPiecesFound,
          buttonDisabled: true,
          onStart: () => {},
          onEnd: () => {},
        }}
      />

      <main className="flex flex-1 items-center justify-center overflow-hidden px-4">
        <div className="w-full max-w-sm rounded-md border-2 border-subtle bg-card p-5 text-sm">
          <h1 className="text-base font-bold text-foreground">
            Join this Search Party session
          </h1>
          <p className="mt-2 text-foreground-muted">
            Enter a name so others can see who&apos;s helping search this set.
            We&apos;ll remember it on this device so you stay recognized if you
            disconnect and rejoin.
          </p>
          <label className="mt-4 block text-sm font-medium text-foreground">
            Name
          </label>
          <Input
            type="text"
            size="md"
            value={displayNameInput}
            onChange={event => setDisplayNameInput(event.target.value)}
            className="mt-1"
            placeholder="e.g., Alice, Living room, iPad"
          />
          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full"
            onClick={() => void handleJoin()}
            disabled={isJoining || !displayNameInput.trim() || !clientId}
          >
            {isJoining ? 'Joining…' : 'Join session'}
          </Button>
        </div>
      </main>
    </div>
  );

  return (
    <>
      {content}
      {joinError && (
        <Toast
          variant="error"
          description={joinError}
          onClose={() => setJoinError(null)}
        />
      )}
    </>
  );
}
