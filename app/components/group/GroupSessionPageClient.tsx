'use client';

import { Button } from '@/app/components/ui/Button';
import { ColorSlotPicker } from '@/app/components/ui/ColorSlotPicker';
import { Input } from '@/app/components/ui/Input';
import { Toast } from '@/app/components/ui/Toast';
import { UpgradeModal } from '@/app/components/upgrade-modal';
import { useGatedOpenTab } from '@/app/hooks/useGatedOpenTab';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import { storeGroupSession } from '@/app/store/group-sessions';
import { spTabId, type SetTab } from '@/app/store/open-tabs';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  const [displayNameInput, setDisplayNameInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return (
        window.localStorage.getItem(`brick_party_group_session_name_${slug}`) ??
        ''
      );
    } catch {
      return '';
    }
  });
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<number | null>(1);

  const clientId = useGroupClientId();
  const router = useRouter();
  const { openTab, showUpgradeModal, dismissUpgradeModal, gateFeature } =
    useGatedOpenTab();

  const handleJoin = async () => {
    if (!clientId) return;
    const name = displayNameInput.trim();
    if (!name) return;
    if (isJoining) return;

    setIsJoining(true);
    try {
      const res = await fetch(
        `/api/group-sessions/${encodeURIComponent(slug)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: name,
            clientToken: clientId,
            ...(selectedColor != null ? { colorSlot: selectedColor } : {}),
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

      // Persist display name for future sessions on this device
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

      // Persist association for auto-rejoin
      storeGroupSession({
        sessionId,
        slug,
        setNumber,
        setName,
        imageUrl,
        numParts,
        year,
        themeId: themeId ?? null,
        participantId: data.participant.id,
        role: 'joiner',
        joinedAt: Date.now(),
      });

      // Open the set as a tab with group session fields (SP tab gets distinct ID)
      const tabId = spTabId(setNumber);
      const setTab: SetTab = {
        type: 'set',
        id: tabId,
        setNumber,
        name: setName,
        imageUrl,
        numParts,
        year,
        themeId: themeId ?? null,
        groupSessionId: sessionId,
        groupSessionSlug: slug,
        groupParticipantId: data.participant.id,
        groupRole: 'joiner',
      };
      const allowed = openTab(setTab);
      if (!allowed) return;

      // Redirect to the tabbed sets page
      router.push(`/sets?active=${encodeURIComponent(tabId)}`);
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

  return (
    <div className="flex min-h-[calc(100dvh-var(--spacing-nav-height))] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-subtle bg-card p-5 text-sm">
        {/* Set context */}
        <div className="mb-4 flex items-center gap-3">
          {imageUrl && (
            <div className="relative size-12 flex-shrink-0 overflow-hidden rounded">
              <Image
                src={imageUrl}
                alt=""
                width={48}
                height={48}
                className="size-full object-contain"
              />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-foreground">
              {setNumber} {setName}
            </p>
            <p className="text-xs text-foreground-muted">{year}</p>
          </div>
        </div>

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
        <div className="mt-4">
          <ColorSlotPicker
            selected={selectedColor}
            onSelect={setSelectedColor}
          />
        </div>
        <Button
          variant="primary"
          size="md"
          className="mt-4 w-full"
          onClick={() => void handleJoin()}
          disabled={isJoining || !displayNameInput.trim() || !clientId}
        >
          {isJoining ? 'Joining...' : 'Join session'}
        </Button>
      </div>

      {joinError && (
        <Toast
          variant="error"
          description={joinError}
          onClose={() => setJoinError(null)}
        />
      )}

      <UpgradeModal
        open={showUpgradeModal}
        feature={gateFeature}
        onClose={dismissUpgradeModal}
      />
    </div>
  );
}
