'use client';

import { SetDetailModal } from '@/app/components/set/SetDetailModal';
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
import {
  ColorSlotPicker,
  getSlotColor,
} from '@/app/components/ui/ColorSlotPicker';
import { IconButton } from '@/app/components/ui/IconButton';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { MoreDropdown } from '@/app/components/ui/MoreDropdown';
import { cn } from '@/app/components/ui/utils';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { Check, Copy, Eye, EyeOff, Trophy, Users, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';

type SetTopBarProps = {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  year?: number;
  numParts?: number;
  themeId?: number | null;
  themeName?: string | null | undefined;
  hideMoreMenu?: boolean;
  searchParty?: {
    active: boolean;
    loading: boolean;
    canHost: boolean;
    isHost?: boolean;
    joinUrl: string | null;
    participants: Array<{
      id: string;
      displayName: string;
      piecesFound: number;
      lastSeenAt: string;
      colorSlot?: number | null;
    }>;
    totalPiecesFound: number;
    currentParticipantId?: string | null;
    buttonDisabled?: boolean;
    slug: string | null;
    onStart: (colorSlot?: number) => Promise<void> | void;
    onEnd: () => Promise<void> | void;
    onContinue: (slug: string, colorSlot?: number) => Promise<void> | void;
    onRemoveParticipant: (participantId: string) => void;
  };
  searchPartyModalOpen?: boolean;
  setSearchPartyModalOpen?: (open: boolean) => void;
  hiddenParticipantIds?: Set<string>;
  onToggleParticipantVisibility?: (participantId: string) => void;
};

export function SetTopBar({
  setNumber,
  setName,
  imageUrl,
  year,
  numParts,
  themeId,
  themeName,
  hideMoreMenu,
  searchParty,
  searchPartyModalOpen: searchPartyModalOpenProp,
  setSearchPartyModalOpen: setSearchPartyModalOpenProp,
  hiddenParticipantIds,
  onToggleParticipantVisibility,
}: SetTopBarProps) {
  // Modal state: use hoisted props when provided (survives conditional remounts),
  // fall back to local state for standalone usage (e.g. group join page).
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const [setDetailModalOpen, setSetDetailModalOpen] = useState(false);
  const searchPartyModalOpen = searchPartyModalOpenProp ?? localModalOpen;
  const setSearchTogetherModalOpen =
    setSearchPartyModalOpenProp ?? setLocalModalOpen;

  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(
    imageUrl ?? null
  );
  const [hasTriedRefresh, setHasTriedRefresh] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedColor, setSelectedColor] = useState<number | null>(1);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<{
    canHost: boolean;
    unlimited?: boolean;
    limit?: number;
    used?: number;
    remaining?: number;
    resetDateFormatted?: string;
    loading: boolean;
  }>({ canHost: true, loading: false });
  const [previousSession, setPreviousSession] = useState<{
    slug: string;
    endedAt: string;
  } | null>(null);
  const ownership = useSetOwnershipState({
    setNumber,
    name: setName,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });
  const { user } = useSupabaseUser();
  const participantCount = searchParty?.participants.length ?? 0;
  const totalPiecesFound = searchParty?.totalPiecesFound ?? 0;
  const bricklinkSetUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(
    setNumber
  )}`;
  const rebrickableSetUrl = `https://rebrickable.com/sets/${encodeURIComponent(setNumber)}/`;
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
  const isConnected = useCallback((lastSeenAt: string) => {
    return Date.now() - new Date(lastSeenAt).getTime() < 2 * 60 * 1000;
  }, []);

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
    await searchParty.onStart?.(selectedColor ?? undefined);
  };

  const handleContinuePreviousSession = async () => {
    if (!searchParty || !previousSession) return;
    if (searchParty.loading || searchParty.active) return;
    await searchParty.onContinue?.(
      previousSession.slug,
      selectedColor ?? undefined
    );
  };

  const handleEndSearchTogether = async () => {
    if (!searchParty) return;
    if (!searchParty.active || searchParty.loading) return;
    await searchParty.onEnd?.();
    setSearchTogetherModalOpen(false);
  };

  const handleCopyShareLink = useCallback(() => {
    const link = searchParty?.joinUrl;
    if (!link) return;
    try {
      void navigator.clipboard?.writeText(link);
      setCopiedLink(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to copy Search Party link', err);
      }
    }
  }, [searchParty?.joinUrl]);

  // Fetch quota info when modal opens
  useEffect(() => {
    if (!searchPartyModalOpen || !user || searchParty?.active) return;

    const fetchQuota = async () => {
      setQuotaInfo(prev => ({ ...prev, loading: true }));
      try {
        const res = await fetch('/api/group-sessions/quota');
        if (res.ok) {
          const data = await res.json();
          setQuotaInfo({ ...data, loading: false });
        } else {
          setQuotaInfo({ canHost: false, loading: false });
        }
      } catch {
        setQuotaInfo({ canHost: false, loading: false });
      }
    };

    void fetchQuota();

    const fetchPrevious = async () => {
      try {
        const res = await fetch(
          `/api/group-sessions/previous?setNumber=${encodeURIComponent(setNumber)}`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            session: { slug: string; endedAt: string } | null;
          };
          setPreviousSession(data.session);
        }
      } catch {
        // Silently fail — continue-previous is optional
      }
    };

    void fetchPrevious();
  }, [searchPartyModalOpen, user, searchParty?.active, setNumber]);

  const handleImageError = async () => {
    if (hasTriedRefresh) {
      // Avoid hammering the API on repeated errors in the same session.
      setResolvedImageUrl(null);
      return;
    }
    setHasTriedRefresh(true);
    try {
      const res = await fetch(
        `/api/sets/${encodeURIComponent(setNumber)}/refresh-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );
      if (!res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('SetTopBar: refresh-image request failed', {
            status: res.status,
          });
        }
        setResolvedImageUrl(null);
        return;
      }
      const data = (await res.json()) as { imageUrl?: string | null };
      if (
        typeof data.imageUrl === 'string' &&
        data.imageUrl.trim().length > 0
      ) {
        setResolvedImageUrl(data.imageUrl.trim());
      } else {
        setResolvedImageUrl(null);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('SetTopBar: refresh-image request errored', err);
      }
      setResolvedImageUrl(null);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex w-full items-center justify-between',
          'lg:col-start-2'
        )}
      >
        <div className="group set relative flex w-full items-center gap-3 bg-card px-3 py-2 lg:pr-3">
          <button
            type="button"
            aria-label="View set details"
            className="size-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-md border-2 border-subtle bg-gradient-to-br from-neutral-100 to-neutral-200 transition-shadow hover:ring-2 hover:ring-theme-primary/40 lg:size-24 dark:from-neutral-800 dark:to-neutral-900"
            onClick={() => setSetDetailModalOpen(true)}
          >
            {resolvedImageUrl ? (
              <Image
                src={resolvedImageUrl}
                alt="Set thumbnail"
                width={80}
                height={80}
                className="size-full object-contain p-1 drop-shadow-sm"
                onError={handleImageError}
              />
            ) : (
              <ImagePlaceholder variant="thumbnail" />
            )}
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-start text-left">
            <div className="flex w-full items-center gap-2">
              <div className="flex min-w-0 items-center truncate font-bold lg:text-xl">
                {setName}
              </div>
              {!hideMoreMenu && (
                <MoreDropdown
                  ariaLabel="Set status and collections"
                  className="absolute top-3 right-3 ml-auto flex-shrink-0"
                >
                  {() => (
                    <div className="min-w-[160px] rounded-lg border-2 border-subtle bg-card p-2 shadow-lg">
                      <SetOwnershipAndCollectionsRow
                        ownership={ownership}
                        variant="dropdown"
                        bricklinkUrl={bricklinkSetUrl}
                        rebrickableUrl={rebrickableSetUrl}
                      />
                    </div>
                  )}
                </MoreDropdown>
              )}
            </div>
            <div className="mt-0.5 text-xs text-foreground-muted lg:text-sm">
              {setNumber}
              {typeof year === 'number' && ` | ${year}`}
              {' | '}
              {numParts} pieces
            </div>
            {searchParty && (
              <div className="mt-1.5">
                <button
                  type="button"
                  aria-label="Search Party"
                  className={cn(
                    'relative inline-flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-[13px] font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 lg:px-4 lg:py-2',
                    searchParty.active
                      ? 'border-theme-primary bg-theme-primary text-theme-primary-contrast shadow-[0_2px_0_0] shadow-theme-shadow/40'
                      : 'border-subtle bg-card text-foreground-muted hover:border-foreground/30 hover:bg-card-muted hover:text-foreground'
                  )}
                  disabled={!searchParty || searchParty.buttonDisabled}
                  onClick={() => {
                    if (!searchParty || searchParty.buttonDisabled) return;
                    setSearchTogetherModalOpen(true);
                  }}
                >
                  <Users className="size-3.5" />
                  Search Party
                  {searchParty.active && (
                    <div className="absolute -top-2.5 right-[-14px] flex size-6 items-center justify-center rounded-full border-2 border-white bg-brand-yellow text-2xs font-extrabold text-neutral-900 shadow-sm">
                      {participantCount.toLocaleString()}
                    </div>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Modal
        open={searchPartyModalOpen && Boolean(searchParty)}
        onClose={() => {
          setSearchTogetherModalOpen(false);
        }}
        title="Search Party"
      >
        {searchParty ? (
          <div className="flex flex-col gap-4 text-sm">
            {!searchParty.active ? (
              <Card>
                <CardHeader className="flex flex-col items-center justify-center gap-2 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-theme-primary/10">
                    <Users className="size-7 text-theme-primary" />
                  </div>
                  <CardTitle className="text-lg">
                    Search for pieces together
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Start a session and invite others to join.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Show quota info for free users */}
                  {!quotaInfo.loading &&
                    !quotaInfo.unlimited &&
                    searchParty.canHost && (
                      <div className="rounded-md border-2 border-subtle bg-card-muted px-4 py-3 text-center text-sm">
                        {quotaInfo.canHost ? (
                          <>
                            <span className="font-bold text-foreground">
                              {quotaInfo.remaining} of {quotaInfo.limit}
                            </span>{' '}
                            <span className="text-foreground-muted">
                              sessions remaining this month
                            </span>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <p className="font-bold text-warning">
                              You&apos;ve used all {quotaInfo.limit} Search
                              Party sessions this month
                            </p>
                            <p className="text-foreground-muted">
                              Your limit resets on{' '}
                              {quotaInfo.resetDateFormatted}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                </CardContent>
                {searchParty.canHost &&
                  (quotaInfo.canHost || previousSession) && (
                    <CardContent>
                      <ColorSlotPicker
                        selected={selectedColor}
                        onSelect={setSelectedColor}
                      />
                    </CardContent>
                  )}
                <CardFooter className="mt-4">
                  {searchParty.canHost ? (
                    quotaInfo.loading ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled
                      >
                        Loading…
                      </Button>
                    ) : quotaInfo.canHost || previousSession ? (
                      <div className="flex w-full flex-col gap-2">
                        {previousSession && (
                          <Button
                            type="button"
                            variant="primary"
                            size="lg"
                            className="w-full"
                            onClick={() => void handleContinuePreviousSession()}
                            disabled={searchParty.loading}
                          >
                            {searchParty.loading
                              ? 'Continuing…'
                              : 'Continue Previous Session'}
                          </Button>
                        )}
                        {quotaInfo.canHost && (
                          <Button
                            type="button"
                            variant={previousSession ? 'secondary' : 'primary'}
                            size="lg"
                            className="w-full"
                            onClick={() => void handleStartSearchTogether()}
                            disabled={searchParty.loading}
                          >
                            {searchParty.loading && !previousSession
                              ? 'Starting…'
                              : 'Start New Session'}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex w-full flex-col gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="lg"
                          className="w-full"
                          onClick={() => {
                            window.location.href = '/pricing';
                          }}
                        >
                          Upgrade to Plus
                        </Button>
                        <p className="text-center text-xs text-foreground-muted">
                          Get unlimited Search Party sessions with Plus
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="text-foreground-muted">
                      Only the session host can start a Search Party session.
                    </p>
                  )}
                </CardFooter>
              </Card>
            ) : (
              <>
                {searchParty.isHost && (
                  <Card>
                    <CardContent className="space-y-4 pt-4">
                      {searchParty?.joinUrl ? (
                        <div className="flex justify-center">
                          <div className="rounded-lg border-2 border-subtle bg-white p-4 shadow-[0_4px_0_0] shadow-subtle/50">
                            <QRCode
                              value={searchParty.joinUrl}
                              size={140}
                              className="h-auto w-[140px]"
                              fgColor="#0a0a0a"
                              bgColor="#ffffff"
                            />
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-bold text-link transition-colors hover:text-link-hover disabled:opacity-50"
                        onClick={handleCopyShareLink}
                        disabled={!searchParty.joinUrl}
                      >
                        {copiedLink ? (
                          <>
                            <Check className="size-3.5 text-green-600" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            Copy join link
                          </>
                        )}
                      </button>
                      <div className="mt-2 flex flex-col items-center gap-2">
                        <span className="text-xs font-medium text-foreground-muted">
                          Or visit{' '}
                          <span className="font-bold text-foreground">
                            {searchParty.joinUrl ?? '/group'}
                          </span>
                        </span>
                        <div className="w-full rounded-md border-2 border-subtle bg-card-muted px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.4em] text-foreground">
                          {sessionCode ?? '———'}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="size-4 text-theme-primary" />
                          <span className="font-bold">
                            {participantCount.toLocaleString()}
                          </span>
                          <span className="text-foreground-muted">
                            participants
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Trophy className="size-4 text-brand-yellow" />
                          <span className="font-bold">
                            {totalPiecesFound.toLocaleString()}
                          </span>
                          <span className="text-foreground-muted">
                            pieces found
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader className="flex flex-col items-center justify-center text-center">
                    <CardTitle className="text-lg">Leaderboard</CardTitle>
                    <CardDescription className="text-sm">
                      Participants ranked by pieces found.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {rankedParticipants.length === 0 ? (
                      <p className="text-sm text-foreground-muted">
                        No participants yet.
                      </p>
                    ) : (
                      <ol className="space-y-1.5">
                        {rankedParticipants.map((participant, index) => {
                          const isCurrent =
                            searchParty.currentParticipantId &&
                            participant.id === searchParty.currentParticipantId;
                          const isFirst = index === 0;
                          const isHidden = hiddenParticipantIds?.has(
                            participant.id
                          );
                          return (
                            <li
                              key={participant.id}
                              className="flex items-center gap-1.5"
                            >
                              {onToggleParticipantVisibility && (
                                <button
                                  type="button"
                                  aria-label={
                                    isHidden
                                      ? `Show ${participant.displayName} on progress bar`
                                      : `Hide ${participant.displayName} from progress bar`
                                  }
                                  className="flex h-11 w-8 flex-shrink-0 items-center justify-center text-foreground-muted hover:text-foreground"
                                  onClick={() =>
                                    onToggleParticipantVisibility(
                                      participant.id
                                    )
                                  }
                                >
                                  {isHidden ? (
                                    <EyeOff className="size-4" />
                                  ) : (
                                    <Eye className="size-4" />
                                  )}
                                </button>
                              )}
                              <div
                                className={cn(
                                  'flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md border-2 px-3 py-2',
                                  isFirst
                                    ? 'border-theme-primary/40 bg-theme-primary/10'
                                    : 'border-subtle bg-card-muted',
                                  isHidden && 'opacity-50'
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className="flex size-6 items-center justify-center rounded-full text-xs font-bold text-white"
                                    style={{
                                      backgroundColor: getSlotColor(
                                        participant.colorSlot,
                                        index
                                      ),
                                      opacity: isConnected(
                                        participant.lastSeenAt
                                      )
                                        ? 1
                                        : 0.4,
                                    }}
                                    title={
                                      isConnected(participant.lastSeenAt)
                                        ? 'Connected'
                                        : 'Disconnected'
                                    }
                                  >
                                    {index + 1}
                                  </span>
                                  <span
                                    className={cn(
                                      'truncate text-sm',
                                      isCurrent ? 'font-bold' : 'font-medium'
                                    )}
                                  >
                                    {isCurrent
                                      ? 'You'
                                      : participant.displayName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-sm font-bold">
                                  {isFirst && (
                                    <Trophy className="size-4 text-theme-primary" />
                                  )}
                                  <span>
                                    {(
                                      participant.piecesFound ?? 0
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              {searchParty.isHost && !isCurrent && (
                                <IconButton
                                  aria-label={`Remove ${participant.displayName}`}
                                  icon={<X className="size-3.5" />}
                                  variant="ghost"
                                  size="sm"
                                  className="flex-shrink-0 rounded-full hover:bg-danger/10 hover:text-danger"
                                  onClick={() =>
                                    searchParty.onRemoveParticipant(
                                      participant.id
                                    )
                                  }
                                />
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </CardContent>
                  <CardFooter className="mt-4">
                    {searchParty.isHost ? (
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
                      <p className="text-xs text-foreground-muted">
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
      <SetDetailModal
        open={setDetailModalOpen}
        onClose={() => setSetDetailModalOpen(false)}
        setNumber={setNumber}
        setName={setName}
        imageUrl={resolvedImageUrl}
        year={year}
        numParts={numParts}
        themeId={themeId}
        themeName={themeName}
      />
    </>
  );
}
