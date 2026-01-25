'use client';

import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { Select } from '@/app/components/ui/Select';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserLists } from '@/app/hooks/useUserLists';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { ExclusivePiece } from '@/app/lib/services/exclusivePieces';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

type Theme = {
  id: number;
  name: string;
  parent_id: number | null;
};

type Props = {
  themes: Theme[];
};

/** Search target - either a theme or a collection */
type SearchTarget =
  | { type: 'theme'; themeId: number; themeName: string }
  | { type: 'owned' }
  | { type: 'wishlist' }
  | { type: 'list'; listId: string; listName: string };

async function fetchExclusivePieces(
  target: SearchTarget,
  getSetNums: () => string[]
): Promise<ExclusivePiece[]> {
  if (target.type === 'theme') {
    const res = await fetch('/api/exclusive-pieces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: target.themeId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? 'Failed to fetch exclusive pieces');
    }
    const data = await res.json();
    return data.pieces ?? [];
  }

  // Collection-based search
  const setNums = getSetNums();
  if (setNums.length === 0) {
    return [];
  }

  const res = await fetch('/api/exclusive-pieces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setNums }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? 'Failed to fetch exclusive pieces');
  }
  const data = await res.json();
  return data.pieces ?? [];
}

export default function ExclusivePiecesClient({ themes }: Props) {
  const { user } = useSupabaseUser();
  const { lists: userLists } = useUserLists();
  const userSets = useUserSetsStore(state => state.sets);

  const [selectedTarget, setSelectedTarget] = useState<SearchTarget | null>(
    null
  );
  const [triggeredTarget, setTriggeredTarget] = useState<SearchTarget | null>(
    null
  );

  // For custom list targets, we need to fetch list membership
  const [listMembership, setListMembership] = useState<
    Record<string, string[]>
  >({});
  const [listMembershipLoading, setListMembershipLoading] = useState<
    string | null
  >(null);

  // Get set numbers for collection-based searches
  const getSetNums = useCallback((): string[] => {
    if (!triggeredTarget) return [];

    if (triggeredTarget.type === 'owned') {
      return Object.values(userSets)
        .filter(s => s.status.owned)
        .map(s => s.setNumber);
    }

    if (triggeredTarget.type === 'wishlist') {
      // Note: Wishlist is now tracked via user_lists (system list), not user_sets store
      // This would need to fetch from the wishlist system list
      return [];
    }

    if (triggeredTarget.type === 'list') {
      return listMembership[triggeredTarget.listId] ?? [];
    }

    return [];
  }, [triggeredTarget, userSets, listMembership]);

  // Query key based on target
  const queryKey = useMemo(() => {
    if (!triggeredTarget) return ['exclusive-pieces', null];

    if (triggeredTarget.type === 'theme') {
      return ['exclusive-pieces', 'theme', triggeredTarget.themeId];
    }
    if (triggeredTarget.type === 'owned') {
      const setNums = getSetNums();
      return ['exclusive-pieces', 'owned', setNums.length];
    }
    if (triggeredTarget.type === 'wishlist') {
      const setNums = getSetNums();
      return ['exclusive-pieces', 'wishlist', setNums.length];
    }
    if (triggeredTarget.type === 'list') {
      const setNums = getSetNums();
      return [
        'exclusive-pieces',
        'list',
        triggeredTarget.listId,
        setNums.length,
      ];
    }
    return ['exclusive-pieces', null];
  }, [triggeredTarget, getSetNums]);

  const {
    data: pieces,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () => {
      if (!triggeredTarget) return [];
      return fetchExclusivePieces(triggeredTarget, getSetNums);
    },
    enabled: triggeredTarget !== null,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch list membership when a custom list is selected
  const fetchListMembership = useCallback(
    async (listId: string) => {
      if (!user) return;
      if (listMembership[listId]) return; // Already cached

      setListMembershipLoading(listId);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('user_list_items')
        .select('set_num')
        .eq('user_id', user.id)
        .eq('list_id', listId)
        .eq('item_type', 'set');

      if (error) {
        console.error('Failed to load list membership', error);
        setListMembershipLoading(null);
        return;
      }

      const setNums = (data ?? [])
        .map(row => row.set_num)
        .filter((s): s is string => typeof s === 'string');

      setListMembership(prev => ({ ...prev, [listId]: setNums }));
      setListMembershipLoading(null);
    },
    [user, listMembership]
  );

  const handleSearch = async () => {
    if (!selectedTarget) return;

    // If a custom list is selected, ensure we have the membership data
    if (selectedTarget.type === 'list') {
      await fetchListMembership(selectedTarget.listId);
    }

    setTriggeredTarget(selectedTarget);
  };

  const handleTargetChange = (value: string) => {
    if (!value) {
      setSelectedTarget(null);
      return;
    }

    if (value === 'owned') {
      setSelectedTarget({ type: 'owned' });
    } else if (value === 'wishlist') {
      setSelectedTarget({ type: 'wishlist' });
    } else if (value.startsWith('list:')) {
      const listId = value.slice(5);
      const list = userLists.find(l => l.id === listId);
      if (list) {
        setSelectedTarget({
          type: 'list',
          listId: list.id,
          listName: list.name,
        });
      }
    } else if (value.startsWith('theme:')) {
      const themeId = parseInt(value.slice(6), 10);
      const theme = themes.find(t => t.id === themeId);
      if (theme) {
        setSelectedTarget({
          type: 'theme',
          themeId: theme.id,
          themeName: theme.name,
        });
      }
    }
  };

  const getTargetValue = (): string => {
    if (!selectedTarget) return '';
    if (selectedTarget.type === 'owned') return 'owned';
    if (selectedTarget.type === 'wishlist') return 'wishlist';
    if (selectedTarget.type === 'list') return `list:${selectedTarget.listId}`;
    if (selectedTarget.type === 'theme')
      return `theme:${selectedTarget.themeId}`;
    return '';
  };

  const getTargetLabel = (): string => {
    if (!triggeredTarget) return '';
    if (triggeredTarget.type === 'theme') return triggeredTarget.themeName;
    if (triggeredTarget.type === 'owned') return 'your owned sets';
    if (triggeredTarget.type === 'wishlist') return 'your wishlist';
    if (triggeredTarget.type === 'list') return `"${triggeredTarget.listName}"`;
    return '';
  };

  const isAuthenticated = !!user;
  const ownedCount = Object.values(userSets).filter(s => s.status.owned).length;
  // Note: Wishlist is now tracked via user_lists (system list), not user_sets store
  const wishlistCount = 0;

  return (
    <div className="container-default py-6">
      {/* Hero Header */}
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-purple text-white">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </div>
          <div>
            <p className="text-2xs font-semibold tracking-wide text-brand-purple uppercase">
              Rare Finds
            </p>
            <h1 className="text-2xl font-bold text-foreground">
              Exclusive Pieces
            </h1>
          </div>
        </div>
        <p className="max-w-xl text-foreground-muted">
          Discover parts that appear in only one LEGO set worldwide. Search by
          theme or explore exclusives in your collection.
        </p>
      </header>

      {/* Search Controls */}
      <div className="mb-8 rounded-xl border-2 border-subtle bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          {/* Search Target Selector */}
          <div className="min-w-[280px] flex-1 sm:max-w-md">
            <label
              htmlFor="search-target"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Search in
            </label>
            <Select
              id="search-target"
              value={getTargetValue()}
              onChange={e => handleTargetChange(e.target.value)}
            >
              <option value="">Choose a theme or collection...</option>

              {/* My Collections (if authenticated) */}
              {isAuthenticated && (
                <optgroup label="My Collections">
                  <option value="owned">
                    Owned Sets{ownedCount > 0 ? ` (${ownedCount} sets)` : ''}
                  </option>
                  <option value="wishlist">
                    Wishlist
                    {wishlistCount > 0 ? ` (${wishlistCount} sets)` : ''}
                  </option>
                  {userLists.map(list => (
                    <option key={list.id} value={`list:${list.id}`}>
                      {list.name}
                    </option>
                  ))}
                </optgroup>
              )}

              {/* Themes */}
              <optgroup label="Themes">
                {themes.map(theme => (
                  <option key={theme.id} value={`theme:${theme.id}`}>
                    {theme.name}
                  </option>
                ))}
              </optgroup>
            </Select>
            {!isAuthenticated && (
              <p className="mt-1 text-xs text-foreground-muted">
                Sign in to search within your collection
              </p>
            )}
          </div>

          {/* Search Button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleSearch}
            disabled={
              !selectedTarget || isLoading || listMembershipLoading !== null
            }
          >
            {isLoading || isFetching || listMembershipLoading !== null ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Searching...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Search
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-16 text-center">
          <BrickLoader label="Scanning the brick vault..." />
          <p className="mt-3 text-sm text-foreground-muted">
            Finding exclusive pieces in {getTargetLabel()}. This may take a
            moment.
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorBanner
          message={error instanceof Error ? error.message : 'An error occurred'}
        />
      )}

      {/* Results */}
      {!isLoading && !error && triggeredTarget !== null && pieces && (
        <>
          {pieces.length === 0 ? (
            <EmptyState
              message={`No exclusive pieces found in ${getTargetLabel()}.`}
            />
          ) : (
            <GroupedBySetView pieces={pieces} targetLabel={getTargetLabel()} />
          )}
        </>
      )}

      {/* Initial State */}
      {!triggeredTarget && !isLoading && (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100">
            <svg
              className="h-8 w-8 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
          </div>
          <p className="text-foreground-muted">
            Select a theme or collection above to discover exclusive pieces.
          </p>
        </div>
      )}
    </div>
  );
}

type SetGroup = {
  setNum: string;
  setName: string;
  setYear: number;
  setImage: string | null;
  pieces: ExclusivePiece[];
};

function GroupedBySetView({
  pieces,
  targetLabel,
}: {
  pieces: ExclusivePiece[];
  targetLabel: string;
}) {
  // Group pieces by set
  const groupedBySet = new Map<string, SetGroup>();
  for (const piece of pieces) {
    const existing = groupedBySet.get(piece.setNum);
    if (existing) {
      existing.pieces.push(piece);
    } else {
      groupedBySet.set(piece.setNum, {
        setNum: piece.setNum,
        setName: piece.setName,
        setYear: piece.setYear,
        setImage: piece.setImage,
        pieces: [piece],
      });
    }
  }

  // Sort sets by year descending, then by set number
  const sortedSets = Array.from(groupedBySet.values()).sort((a, b) => {
    if (b.setYear !== a.setYear) return b.setYear - a.setYear;
    return a.setNum.localeCompare(b.setNum);
  });

  const totalPieces = pieces.length;
  const totalSets = sortedSets.length;

  return (
    <div>
      {/* Stats Banner */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-brand-purple/10 bg-brand-purple/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-purple text-sm font-bold text-white">
            {totalPieces}
          </div>
          <span className="text-sm text-foreground">
            exclusive piece{totalPieces !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="h-4 w-px bg-brand-purple/20" />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-orange text-sm font-bold text-white">
            {totalSets}
          </div>
          <span className="text-sm text-foreground">
            set{totalSets !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-brand-purple/20 sm:block" />
        <span className="hidden text-sm text-foreground-muted sm:inline">
          in <span className="font-medium text-foreground">{targetLabel}</span>
        </span>
      </div>

      {/* Set Cards */}
      <div className="space-y-5">
        {sortedSets.map((setGroup, index) => (
          <SetGroupCard key={setGroup.setNum} group={setGroup} index={index} />
        ))}
      </div>
    </div>
  );
}

function SetGroupCard({ group, index }: { group: SetGroup; index: number }) {
  // Cycle through brand colors for visual variety
  const accentColors = [
    'bg-brand-blue',
    'bg-brand-red',
    'bg-brand-green',
    'bg-brand-orange',
    'bg-brand-purple',
  ];
  const accentColor = accentColors[index % accentColors.length];

  return (
    <div className="overflow-hidden rounded-xl border-2 border-subtle bg-card shadow-sm">
      {/* Set Header */}
      <div className="flex items-center gap-4 border-b-2 border-subtle bg-card-muted p-4">
        <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-white">
          <OptimizedImage
            src={group.setImage}
            alt={group.setName}
            variant="exclusiveSetThumb"
            className="h-20 w-20 object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="leading-tight font-semibold text-foreground">
            {group.setName}
          </h3>
          <p className="mt-0.5 text-sm text-foreground-muted">{group.setNum}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-foreground-muted">
              {group.setYear}
            </span>
            <span
              className={`inline-flex items-center rounded-full ${accentColor} px-2.5 py-0.5 text-xs font-semibold text-white`}
            >
              {group.pieces.length} exclusive
            </span>
          </div>
        </div>
      </div>

      {/* Pieces Grid */}
      <div className="divide-y divide-subtle">
        {group.pieces.map(piece => (
          <ExclusivePieceRow
            key={`${piece.partNum}-${piece.colorId}`}
            piece={piece}
          />
        ))}
      </div>
    </div>
  );
}

function ExclusivePieceRow({ piece }: { piece: ExclusivePiece }) {
  const colorStyle = piece.colorRgb
    ? { backgroundColor: `#${piece.colorRgb}` }
    : undefined;

  return (
    <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-card-muted">
      {/* Part image */}
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-white">
        <OptimizedImage
          src={piece.partImage}
          alt={piece.partName}
          variant="exclusivePieceThumb"
          className="h-14 w-14 object-contain"
        />
      </div>

      {/* Part details */}
      <div className="min-w-0 flex-1">
        <p
          className="line-clamp-2 leading-tight font-medium text-foreground"
          title={piece.partName}
        >
          {piece.partName}
        </p>
        <p className="mt-0.5 font-mono text-xs text-foreground-muted">
          {piece.partNum}
        </p>
      </div>

      {/* Color info */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {colorStyle && (
          <span
            className="h-5 w-5 rounded-md border-2 border-neutral-200 shadow-sm"
            style={colorStyle}
            title={piece.colorName}
          />
        )}
        <span className="text-sm whitespace-nowrap text-foreground-muted">
          {piece.colorName}
        </span>
      </div>
    </div>
  );
}
