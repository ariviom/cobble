'use client';

import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { Modal } from '@/app/components/ui/Modal';
import { MoreDropdown } from '@/app/components/ui/MoreDropdown';
import { cn } from '@/app/components/ui/utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { Copy, QrCode, Trophy, Users } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';

type SetTopBarProps = {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  year?: number;
  numParts?: number;
  themeId?: number | null;
  searchParty?: {
    active: boolean;
    loading: boolean;
    canHost: boolean;
    joinUrl: string | null;
    participants: Array<{
      id: string;
      displayName: string;
      piecesFound: number;
    }>;
    totalPiecesFound: number;
    currentParticipantId?: string | null;
    onStart: () => Promise<void> | void;
    onEnd: () => Promise<void> | void;
  };
};

export function SetTopBar({
  setNumber,
  setName,
  imageUrl,
  year,
  numParts,
  themeId,
  searchParty,
}: SetTopBarProps) {
  const [searchPartyModalOpen, setSearchTogetherModalOpen] = useState(false);
  const { isLoading, totalMissing, ownedTotal } = useInventory(setNumber);
  const ownership = useSetOwnershipState({
    setNumber,
    name: setName,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });
  const participantCount = searchParty?.participants.length ?? 0;
  const totalPiecesFound = searchParty?.totalPiecesFound ?? 0;
  const sessionCode = useMemo(() => {
    const joinUrl = searchParty?.joinUrl;
    if (!joinUrl) return null;
    try {
      const url = new URL(joinUrl, 'https://example.com');
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      return last ? last.toUpperCase() : null;
    } catch {
      const segments = joinUrl.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      return last ? last.toUpperCase() : null;
    }
  }, [searchParty?.joinUrl]);
  const rankedParticipants = useMemo(
    () =>
      (searchParty?.participants ?? []).slice().sort((a, b) => {
        const aPieces = a.piecesFound ?? 0;
        const bPieces = b.piecesFound ?? 0;
        if (bPieces !== aPieces) return bPieces - aPieces;
        return a.displayName.localeCompare(b.displayName);
      }),
    [searchParty?.participants]
  );

  const handleStartSearchTogether = async () => {
    if (!searchParty) return;
    if (searchParty.loading || searchParty.active) return;
    await searchParty.onStart?.();
  };

  const handleEndSearchTogether = async () => {
    if (!searchParty) return;
    if (!searchParty.active || searchParty.loading) return;
    await searchParty.onEnd?.();
  };

  const handleCopyShareLink = () => {
    const link = searchParty?.joinUrl;
    if (!link) return;
    try {
      void navigator.clipboard?.writeText(link);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to copy Search Party link', err);
      }
    }
  };

  return (
    <>
      <div
        className={cn(
          'fixed top-0 right-0 z-60 flex h-topnav-height w-full items-center justify-between',
          'lg:relative lg:h-full lg:w-full'
        )}
      >
        <div className="group set flex h-full w-full items-center gap-3 bg-card px-2 py-2 lg:pr-2">
          <div className="aspect-square max-h-full overflow-hidden rounded-sm border border-foreground-accent">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="Set thumbnail"
                width={240}
                height={240}
                className="h-full w-auto object-cover transition-transform"
              />
            ) : (
              <div className="flex size-[calc(var(--spacing-topnav-height)-1rem)] flex-shrink-0 items-center justify-center rounded-sm border border-subtle bg-card-muted">
                No Image
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start text-left">
            <div className="flex w-full items-center gap-2">
              <div className="flex min-w-0 items-center truncate font-bold lg:text-xl">
                {setName}
              </div>
              <MoreDropdown
                ariaLabel="Set status and collections"
                className="absolute top-3 right-3 ml-auto flex-shrink-0"
              >
                {() => (
                  <SetOwnershipAndCollectionsRow
                    ownership={ownership}
                    variant="dropdown"
                  />
                )}
              </MoreDropdown>
            </div>
            <div className="mt-0.5 text-xs text-foreground-muted lg:text-sm">
              {isLoading
                ? 'Computing…'
                : `${ownedTotal} / ${totalMissing} parts`}
            </div>
            {searchParty && (
              <button
                type="button"
                aria-label="Search Party"
                className={cn(
                  'relative mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  searchParty.active
                    ? 'text-theme-primary-contrast border-theme-primary bg-theme-primary'
                    : 'hover:text-theme-primary-contrast border-foreground text-foreground hover:border-theme-primary hover:bg-theme-primary'
                )}
                disabled={!searchParty}
                onClick={() => {
                  if (!searchParty) return;
                  setSearchTogetherModalOpen(true);
                }}
              >
                <Users className="size-4" />
                Search Party
                {searchParty.active && (
                  <div className="text-theme-primary-contrast absolute -right-2 -bottom-3 flex size-5 items-center justify-center rounded-full border-2 border-background bg-theme-primary text-sm">
                    {participantCount.toLocaleString()}
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      <Modal
        open={searchPartyModalOpen && Boolean(searchParty)}
        onClose={() => setSearchTogetherModalOpen(false)}
        title="Search Party"
      >
        {searchParty ? (
          <div className="flex flex-col gap-4 text-xs">
            {!searchParty.active ? (
              <Card elevated>
                <CardHeader className="flex flex-col items-center justify-center gap-1 text-center">
                  <Users className="mb-2 size-6 text-theme-primary" />
                  <CardTitle>Search for pieces together</CardTitle>
                  <CardDescription>
                    Start a session to collaborate on finding pieces for this
                    set.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-4">
                  {searchParty.canHost ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      className="w-full"
                      onClick={() => void handleStartSearchTogether()}
                      disabled={searchParty.loading}
                    >
                      {searchParty.loading ? 'Starting…' : 'Start New Session'}
                    </Button>
                  ) : (
                    <p className="text-foreground-muted">
                      Only the session host can start a Search Party session.
                    </p>
                  )}
                </CardFooter>
              </Card>
            ) : (
              <>
                <Card elevated>
                  <CardHeader className="flex flex-col gap-1">
                    <CardTitle>Session code</CardTitle>
                    <CardDescription>
                      Share this session so others can search for pieces with
                      you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex-1 rounded-md border border-subtle bg-background px-3 py-2 text-center font-mono text-lg tracking-[0.35em]">
                        {sessionCode ?? '———'}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2 sm:mt-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="md"
                          className="p-3.5"
                          onClick={handleCopyShareLink}
                          disabled={!searchParty.joinUrl}
                          aria-label="Copy session link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="md"
                          className="p-3.5"
                          onClick={handleCopyShareLink}
                          disabled={!searchParty.joinUrl}
                          aria-label="Copy session link (QR)"
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground-muted">
                      <span>
                        {participantCount.toLocaleString()} participants
                      </span>
                      <span>·</span>
                      <span>
                        {totalPiecesFound.toLocaleString()} pieces found
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card elevated>
                  <CardHeader>
                    <CardTitle>Leaderboard</CardTitle>
                    <CardDescription>
                      Participants ranked by pieces found.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {rankedParticipants.length === 0 ? (
                      <p className="text-[11px] text-foreground-muted">
                        No participants yet.
                      </p>
                    ) : (
                      <ol className="space-y-1">
                        {rankedParticipants.map((participant, index) => {
                          const isCurrent =
                            searchParty.currentParticipantId &&
                            participant.id === searchParty.currentParticipantId;
                          return (
                            <li
                              key={participant.id}
                              className="flex items-center justify-between gap-3 rounded-md bg-background px-2 py-1.5"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="w-6 font-semibold text-foreground-muted">
                                  #{index + 1}
                                </span>
                                <span
                                  className={cn(
                                    'text truncate',
                                    isCurrent && 'font-semibold'
                                  )}
                                >
                                  {isCurrent ? 'You' : participant.displayName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 font-medium">
                                <Trophy className="size-3 text-brand-yellow" />
                                <span>
                                  {(
                                    participant.piecesFound ?? 0
                                  ).toLocaleString()}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </CardContent>
                  <CardFooter className="mt-4">
                    {searchParty.canHost ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="md"
                        className="w-full"
                        onClick={() => void handleEndSearchTogether()}
                        disabled={searchParty.loading}
                      >
                        {searchParty.loading ? 'Ending…' : 'End session'}
                      </Button>
                    ) : (
                      <p className="text-[11px] text-foreground-muted">
                        Only the session host can end this Search Party session.
                      </p>
                    )}
                  </CardFooter>
                </Card>
              </>
            )}
          </div>
        ) : (
          <div className="text-xs text-foreground-muted">
            Search Party is unavailable for this set.
          </div>
        )}
      </Modal>
    </>
  );
}
