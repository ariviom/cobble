'use client';

import { PublicSetCard } from '@/app/components/set/PublicSetCard';
import { Button } from '@/app/components/ui/Button';
import { CollectionGroupHeading } from '@/app/components/ui/CollectionGroupHeading';
import { Select } from '@/app/components/ui/Select';
import { cn } from '@/app/components/ui/utils';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type PublicSetSummary = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number | null;
  theme_id: number | null;
  status: 'owned' | 'want' | null;
};

type PublicCollection = {
  id: string;
  name: string;
  sets: PublicSetSummary[];
};

type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

type CustomCollectionFilter = `collection:${string}`;
type CollectionFilter = 'all' | 'owned' | 'wishlist' | CustomCollectionFilter;
type GroupBy = 'status' | 'theme';

type PublicSetsView = 'all' | 'owned' | 'wishlist';

function makeCustomCollectionFilter(id: string): CustomCollectionFilter {
  return `collection:${id}`;
}

function extractCollectionId(value: CollectionFilter): string | null {
  if (value === 'all' || value === 'owned' || value === 'wishlist') return null;
  return value.replace('collection:', '');
}

function getPrimaryStatusLabel(status: 'owned' | 'want' | null): string {
  if (status === 'owned') return 'Owned';
  if (status === 'want') return 'Wishlist';
  return 'Collections';
}

function getRootThemeId(
  themeId: number,
  themeMap: Map<number, ThemeInfo>
): number {
  let current = themeMap.get(themeId);
  if (!current) return themeId;
  while (current.parent_id != null) {
    const parent = themeMap.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function getRootThemeName(
  themeId: number,
  themeMap: Map<number, ThemeInfo>
): string | null {
  const rootId = getRootThemeId(themeId, themeMap);
  const root = themeMap.get(rootId);
  return root?.name ?? null;
}

type PublicUserSetsOverviewProps = {
  allSets: PublicSetSummary[];
  collections: PublicCollection[];
  initialThemes?: ThemeInfo[];
  initialView?: PublicSetsView;
};

export function PublicUserSetsOverview({
  allSets,
  collections,
  initialThemes = [],
  initialView = 'all',
}: PublicUserSetsOverviewProps) {
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>(
    () => {
      if (initialView === 'owned') return 'owned';
      if (initialView === 'wishlist') return 'wishlist';
      return 'all';
    }
  );
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [themeFilter, setThemeFilter] = useState<number | 'all'>('all');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync the selected collection from the ?collection=<name> query param when present.
  useEffect(() => {
    const collectionName = searchParams?.get('collection');
    if (!collectionName) return;

    const match = collections.find(col => col.name === collectionName);
    if (!match) return;

    const targetFilter = makeCustomCollectionFilter(match.id);
    setCollectionFilter(current =>
      current === targetFilter ? current : targetFilter
    );
  }, [collections, searchParams]);

  const themeMap = useMemo(() => {
    const map = new Map<number, ThemeInfo>();
    for (const theme of initialThemes) {
      if (
        theme &&
        typeof theme.id === 'number' &&
        Number.isFinite(theme.id) &&
        typeof theme.name === 'string'
      ) {
        map.set(theme.id, theme);
      }
    }
    return map;
  }, [initialThemes]);

  const themeOptions = useMemo(() => {
    const names = new Map<number, string>();
    for (const set of allSets) {
      if (typeof set.theme_id === 'number' && Number.isFinite(set.theme_id)) {
        const rootId = getRootThemeId(set.theme_id, themeMap);
        const name = getRootThemeName(set.theme_id, themeMap);
        if (name) {
          names.set(rootId, name);
        }
      }
    }
    return Array.from(names.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSets, themeMap]);

  const selectedCollectionId = useMemo(
    () => extractCollectionId(collectionFilter),
    [collectionFilter]
  );

  const filteredSets = useMemo(() => {
    const customCollectionId = selectedCollectionId;
    const customCollection = customCollectionId
      ? collections.find(c => c.id === customCollectionId)
      : null;
    const customCollectionSetNums = customCollection
      ? new Set(customCollection.sets.map(s => s.set_num))
      : null;

    return allSets.filter(set => {
      const { status } = set;
      // When filtering by 'owned', only show sets with status 'owned'
      if (collectionFilter === 'owned' && status !== 'owned') return false;
      // When filtering by 'wishlist', only show sets with status 'want'
      if (collectionFilter === 'wishlist' && status !== 'want') return false;
      // When filtering by a custom collection, show all sets in that collection
      if (customCollectionId && customCollectionSetNums) {
        if (!customCollectionSetNums.has(set.set_num)) {
          return false;
        }
      }
      // When showing 'all', include sets with status and sets in collections (even if no status)

      if (themeFilter !== 'all') {
        if (
          typeof set.theme_id !== 'number' ||
          !Number.isFinite(set.theme_id)
        ) {
          return false;
        }
        const rootId = getRootThemeId(set.theme_id, themeMap);
        if (rootId !== themeFilter) return false;
      }
      return true;
    });
  }, [
    allSets,
    collectionFilter,
    selectedCollectionId,
    collections,
    themeFilter,
    themeMap,
  ]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredSets>();

    // If a custom collection is selected, show it as a single group with the collection name
    if (selectedCollectionId) {
      const customCollection = collections.find(
        c => c.id === selectedCollectionId
      );
      if (customCollection) {
        // When filtering by a custom collection, group by status or theme within that collection
        for (const set of filteredSets) {
          let key: string;
          if (groupBy === 'status') {
            key = getPrimaryStatusLabel(set.status);
          } else {
            const themeName =
              typeof set.theme_id === 'number' && Number.isFinite(set.theme_id)
                ? getRootThemeName(set.theme_id, themeMap)
                : null;
            key = themeName ?? 'Unknown theme';
          }
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(set);
        }
      }
    } else {
      // Normal grouping when no custom collection is selected
      for (const set of filteredSets) {
        let key: string;
        if (groupBy === 'status') {
          key = getPrimaryStatusLabel(set.status);
        } else {
          const themeName =
            typeof set.theme_id === 'number' && Number.isFinite(set.theme_id)
              ? getRootThemeName(set.theme_id, themeMap)
              : null;
          key = themeName ?? 'Unknown theme';
        }
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(set);
      }
    }

    return Array.from(groups.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredSets, groupBy, themeMap, selectedCollectionId, collections]);

  const hasAnySets = allSets.length > 0;

  return (
    <section className="mb-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Public collections</h2>
          {hasAnySets && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="collection-filter"
                  className="flex items-center gap-2 text-xs"
                >
                  <span>Collection</span>
                </label>
                <Select
                  id="collection-filter"
                  className="px-2 py-1 text-xs"
                  value={collectionFilter}
                  onChange={event => {
                    const next = event.target.value as CollectionFilter;
                    setCollectionFilter(next);

                    if (!pathname) {
                      return;
                    }

                    const params = new URLSearchParams(
                      searchParams ? searchParams.toString() : undefined
                    );

                    if (next === 'all') {
                      // "All" is the default view – drop explicit params.
                      params.delete('view');
                      params.delete('collection');
                    } else if (next === 'owned' || next === 'wishlist') {
                      params.set('view', next);
                      params.delete('collection');
                    } else {
                      // A specific collection selected.
                      const collectionId = extractCollectionId(next);
                      if (collectionId) {
                        const match = collections.find(
                          col => col.id === collectionId
                        );
                        if (match) {
                          params.set('collection', match.name);
                        } else {
                          params.delete('collection');
                        }
                      } else {
                        params.delete('collection');
                      }
                      params.delete('view');
                    }

                    const query = params.toString();
                    const href = query ? `${pathname}?${query}` : pathname;
                    router.replace(href, { scroll: false });
                  }}
                >
                  <option value="all">All</option>
                  <option value="owned">Owned</option>
                  <option value="wishlist">Wishlist</option>
                  {collections.map(collection => (
                    <option
                      key={collection.id}
                      value={makeCustomCollectionFilter(collection.id)}
                    >
                      {collection.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="theme-filter" className="text-xs">
                  Theme
                </label>
                <Select
                  id="theme-filter"
                  className="px-2 py-1 text-xs"
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
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Group by</span>
                <div className="inline-flex rounded-md border border-subtle bg-card text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant={groupBy === 'status' ? 'secondary' : 'ghost'}
                    className={cn(
                      'rounded-none px-2 py-1 first:rounded-l-md last:rounded-r-md',
                      groupBy === 'status' && 'font-medium'
                    )}
                    onClick={() => setGroupBy('status')}
                  >
                    Collection
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={groupBy === 'theme' ? 'secondary' : 'ghost'}
                    className={cn(
                      'rounded-none px-2 py-1 first:rounded-l-md last:rounded-r-md',
                      groupBy === 'theme' && 'font-medium'
                    )}
                    onClick={() => setGroupBy('theme')}
                  >
                    Theme
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!hasAnySets && (
          <div className="mt-2 text-sm text-foreground-muted">
            No public collections or sets yet.
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
                <CollectionGroupHeading>{group.label}</CollectionGroupHeading>
                <div
                  data-item-size="md"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {group.items.map(set => (
                    <PublicSetCard
                      key={set.set_num}
                      setNumber={set.set_num}
                      name={set.name}
                      year={set.year}
                      imageUrl={set.image_url}
                      numParts={set.num_parts}
                      themeLabel={
                        typeof set.theme_id === 'number' &&
                        Number.isFinite(set.theme_id)
                          ? getRootThemeName(set.theme_id, themeMap)
                          : null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
