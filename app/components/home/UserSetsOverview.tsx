'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import { cn } from '@/app/components/ui/utils';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useEffect, useMemo, useState } from 'react';

type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

type StatusFilter = 'all' | 'owned' | 'canBuild' | 'wantToBuild';
type GroupBy = 'status' | 'theme';

type ThemeMap = Map<number, ThemeInfo>;

function useThemesForUserSets(themeIds: number[]): {
  themeMap: ThemeMap;
  isLoading: boolean;
} {
  const [themeMap, setThemeMap] = useState<ThemeMap>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (themeIds.length === 0) {
      setThemeMap(new Map());
      return;
    }
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/themes');
        if (!res.ok) throw new Error('themes_failed');
        const data = (await res.json()) as { themes?: ThemeInfo[] };
        const all = Array.isArray(data.themes) ? data.themes : [];
        const map: ThemeMap = new Map();
        for (const t of all) {
          if (
            typeof t.id === 'number' &&
            Number.isFinite(t.id) &&
            typeof t.name === 'string'
          ) {
            map.set(t.id, t);
          }
        }
        if (!cancelled) {
          setThemeMap(map);
        }
      } catch {
        if (!cancelled) {
          setThemeMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [themeIds]);

  return { themeMap, isLoading };
}

function getPrimaryStatusLabel(status: {
  owned: boolean;
  canBuild: boolean;
  wantToBuild: boolean;
}): string {
  if (status.owned) return 'Owned';
  if (status.canBuild) return 'Can build';
  if (status.wantToBuild) return 'Want to build';
  return 'Uncategorized';
}

function getRootThemeId(themeId: number, themeMap: ThemeMap): number {
  let current = themeMap.get(themeId);
  if (!current) return themeId;
  while (current.parent_id != null) {
    const parent = themeMap.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function getRootThemeName(themeId: number, themeMap: ThemeMap): string {
  const rootId = getRootThemeId(themeId, themeMap);
  const root = themeMap.get(rootId);
  return root?.name ?? 'Unknown theme';
}

export function UserSetsOverview() {
  const [mounted, setMounted] = useState(false);
  const setsRecord = useUserSetsStore(state => state.sets);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [themeFilter, setThemeFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    setMounted(true);
  }, []);

  const sets = useMemo(
    () =>
      Object.values(setsRecord).sort(
        (a, b) => b.lastUpdatedAt - a.lastUpdatedAt
      ),
    [setsRecord]
  );

  const themeIds = useMemo(
    () =>
      Array.from(
        new Set(
          sets
            .map(s => s.themeId)
            .filter(
              (id): id is number =>
                typeof id === 'number' && Number.isFinite(id)
            )
        )
      ),
    [sets]
  );

  const { themeMap, isLoading: themesLoading } = useThemesForUserSets(themeIds);

  const themeOptions = useMemo(() => {
    const names = new Map<number, string>();
    for (const set of sets) {
      if (typeof set.themeId === 'number' && Number.isFinite(set.themeId)) {
        const rootId = getRootThemeId(set.themeId, themeMap);
        const name = getRootThemeName(set.themeId, themeMap);
        names.set(rootId, name);
      }
    }
    return Array.from(names.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sets, themeMap]);

  const filteredSets = useMemo(() => {
    return sets.filter(set => {
      const { status } = set;
      if (statusFilter === 'owned' && !status.owned) return false;
      if (statusFilter === 'canBuild' && !status.canBuild) return false;
      if (statusFilter === 'wantToBuild' && !status.wantToBuild) return false;

      if (themeFilter !== 'all') {
        if (typeof set.themeId !== 'number' || !Number.isFinite(set.themeId)) {
          return false;
        }
        const rootId = getRootThemeId(set.themeId, themeMap);
        if (rootId !== themeFilter) return false;
      }
      return true;
    });
  }, [sets, statusFilter, themeFilter, themeMap]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredSets>();
    for (const set of filteredSets) {
      let key: string;
      if (groupBy === 'status') {
        key = getPrimaryStatusLabel(set.status);
      } else {
        if (typeof set.themeId === 'number' && Number.isFinite(set.themeId)) {
          key = getRootThemeName(set.themeId, themeMap);
        } else {
          key = 'Unknown theme';
        }
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(set);
    }
    return Array.from(groups.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredSets, groupBy, themeMap]);

  const hasAnySets = sets.length > 0;

  // Avoid SSR/CSR hydration mismatches: render a static shell until mounted.
  if (!mounted) {
    return (
      <section className="mb-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="my-4">
            <h2 className="text-lg font-semibold">Your sets</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Your sets</h2>
          {hasAnySets && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <label htmlFor="status-filter" className="text-xs">
                  Status
                </label>
                <select
                  id="status-filter"
                  className="rounded border border-neutral-300 bg-background px-2 py-1 text-xs"
                  value={statusFilter}
                  onChange={event =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="owned">Owned</option>
                  <option value="canBuild">Can build</option>
                  <option value="wantToBuild">Want to build</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="theme-filter" className="text-xs">
                  Theme
                </label>
                <select
                  id="theme-filter"
                  className="rounded border border-neutral-300 bg-background px-2 py-1 text-xs"
                  value={themeFilter === 'all' ? 'all' : String(themeFilter)}
                  onChange={event => {
                    const v = event.target.value;
                    if (v === 'all') {
                      setThemeFilter('all');
                    } else {
                      const parsed = Number(v);
                      setThemeFilter(Number.isFinite(parsed) ? parsed : 'all');
                    }
                  }}
                >
                  <option value="all">All themes</option>
                  {themeOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Group by</span>
                <div className="inline-flex rounded border border-neutral-300 bg-background text-xs">
                  <button
                    type="button"
                    className={cn(
                      'px-2 py-1',
                      groupBy === 'status' && 'bg-neutral-200 font-medium'
                    )}
                    onClick={() => setGroupBy('status')}
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'px-2 py-1',
                      groupBy === 'theme' && 'bg-neutral-200 font-medium'
                    )}
                    onClick={() => setGroupBy('theme')}
                  >
                    Theme
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!hasAnySets && (
          <div className="mt-2 text-sm text-foreground-muted">
            You have no tracked sets yet. Use the status menu on search results
            or set pages to mark sets as{' '}
            <span className="font-medium">Owned</span>,{' '}
            <span className="font-medium">Can build</span>, or{' '}
            <span className="font-medium">Want to build</span>.
          </div>
        )}

        {hasAnySets && filteredSets.length === 0 && (
          <div className="mt-2 text-sm text-foreground-muted">
            No sets match the current filters.
          </div>
        )}

        {hasAnySets && filteredSets.length > 0 && (
          <div className="mt-4 flex flex-col gap-6">
            {grouped.map(group => (
              <div key={group.label} className="flex flex-col gap-2">
                <div className="px-1 py-1 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
                  {group.label}
                </div>
                <div
                  data-item-size="md"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {group.items.map(set => (
                    <SetDisplayCard
                      key={set.setNumber}
                      setNumber={set.setNumber}
                      name={set.name}
                      year={set.year}
                      imageUrl={set.imageUrl}
                      numParts={set.numParts}
                      themeId={set.themeId}
                      themeLabel={
                        typeof set.themeId === 'number' &&
                        Number.isFinite(set.themeId)
                          ? getRootThemeName(set.themeId, themeMap)
                          : null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {themesLoading && hasAnySets && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading themes…
          </div>
        )}
      </div>
    </section>
  );
}
