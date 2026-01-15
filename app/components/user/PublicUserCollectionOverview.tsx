'use client';

import { PublicMinifigCard } from '@/app/components/minifig/PublicMinifigCard';
import { PublicSetCard } from '@/app/components/set/PublicSetCard';
import { CollectionGroupHeading } from '@/app/components/ui/CollectionGroupHeading';
import { FilterBar } from '@/app/components/ui/FilterBar';
import { SegmentedControl } from '@/app/components/ui/SegmentedControl';
import { Select } from '@/app/components/ui/Select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type PublicSetSummary = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number | null;
  theme_id: number | null;
  status: 'owned' | 'want' | null;
};

type PublicMinifigSummary = {
  fig_num: string;
  name: string | null;
  num_parts: number | null;
  status: 'owned' | 'want' | null;
  image_url?: string | null;
  bl_id?: string | null;
};

type PublicListSummary = {
  id: string;
  name: string;
  setNums: string[];
  minifigIds: string[];
};

type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

type CustomListFilter = `list:${string}`;
type CollectionFilter = 'all' | 'owned' | 'wishlist' | CustomListFilter;
type GroupBy = 'status' | 'theme';
type CollectionType = 'sets' | 'minifigs';
type PublicSetsView = 'all' | 'owned' | 'wishlist';

function makeCustomListFilter(id: string): CustomListFilter {
  return `list:${id}`;
}

function extractListId(value: CollectionFilter): string | null {
  if (value === 'all' || value === 'owned' || value === 'wishlist') return null;
  return value.replace('list:', '');
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

function getMinifigStatusLabel(status: PublicMinifigSummary['status']): string {
  switch (status) {
    case 'owned':
      return 'Owned';
    case 'want':
      return 'Wishlist';
    default:
      return 'Minifigures';
  }
}

type PublicUserCollectionOverviewProps = {
  allSets: PublicSetSummary[];
  allMinifigs: PublicMinifigSummary[];
  lists: PublicListSummary[];
  initialThemes?: ThemeInfo[];
  initialView?: PublicSetsView;
  initialType?: CollectionType;
};

export function PublicUserCollectionOverview({
  allSets,
  allMinifigs,
  lists,
  initialThemes = [],
  initialView = 'all',
  initialType = 'sets',
}: PublicUserCollectionOverviewProps) {
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>(
    () => {
      if (initialView === 'owned') return 'owned';
      if (initialView === 'wishlist') return 'wishlist';
      return 'all';
    }
  );
  const [collectionType, setCollectionType] =
    useState<CollectionType>(initialType);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [themeFilter, setThemeFilter] = useState<number | 'all'>('all');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync the selected list from the ?list=<name> query param when present.
  useEffect(() => {
    const listName = searchParams?.get('list');
    if (!listName) return;

    const match = lists.find(list => list.name === listName);
    if (!match) return;

    const targetFilter = makeCustomListFilter(match.id);
    setCollectionFilter(current =>
      current === targetFilter ? current : targetFilter
    );
  }, [lists, searchParams]);

  // Sync collection type from ?type= query param.
  useEffect(() => {
    const typeParam = searchParams?.get('type');
    if (typeParam === 'minifigs') {
      setCollectionType('minifigs');
    } else if (typeParam === 'sets') {
      setCollectionType('sets');
    }
  }, [searchParams]);

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

  const selectedListId = useMemo(
    () => extractListId(collectionFilter),
    [collectionFilter]
  );

  const selectedList = useMemo(
    () =>
      selectedListId ? lists.find(list => list.id === selectedListId) : null,
    [lists, selectedListId]
  );

  const filteredSets = useMemo(() => {
    const membership = selectedList ? new Set(selectedList.setNums) : null;

    return allSets.filter(set => {
      const { status } = set;
      if (collectionFilter === 'owned' && status !== 'owned') return false;
      if (collectionFilter === 'wishlist' && status !== 'want') return false;
      if (membership && !membership.has(set.set_num)) return false;

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
  }, [allSets, collectionFilter, selectedList, themeFilter, themeMap]);

  const groupedSets = useMemo(() => {
    const groups = new Map<string, typeof filteredSets>();
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
    return Array.from(groups.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredSets, groupBy, themeMap]);

  const filteredMinifigs = useMemo(() => {
    const membership = selectedList ? new Set(selectedList.minifigIds) : null;
    return allMinifigs.filter(fig => {
      if (collectionFilter === 'owned' && fig.status !== 'owned') return false;
      if (collectionFilter === 'wishlist' && fig.status !== 'want')
        return false;
      if (membership && !membership.has(fig.fig_num)) return false;
      return true;
    });
  }, [allMinifigs, collectionFilter, selectedList]);

  const groupedMinifigs = useMemo(() => {
    const groups = new Map<string, typeof filteredMinifigs>();
    for (const fig of filteredMinifigs) {
      const key = getMinifigStatusLabel(fig.status);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(fig);
    }
    return Array.from(groups.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredMinifigs]);

  const hasAnySets = allSets.length > 0;
  const hasAnyMinifigs = allMinifigs.length > 0;
  const hasAnyItems = collectionType === 'sets' ? hasAnySets : hasAnyMinifigs;

  const heading = collectionType === 'sets' ? 'Sets' : 'Minifigures';

  const handleFilterChange = (next: CollectionFilter) => {
    setCollectionFilter(next);
    if (!pathname) return;
    const params = new URLSearchParams(
      searchParams ? searchParams.toString() : undefined
    );

    if (next === 'all') {
      params.delete('view');
      params.delete('list');
    } else if (next === 'owned' || next === 'wishlist') {
      params.set('view', next);
      params.delete('list');
    } else {
      const listId = extractListId(next);
      if (listId) {
        const match = lists.find(list => list.id === listId);
        if (match) {
          params.set('list', match.name);
        } else {
          params.delete('list');
        }
      } else {
        params.delete('list');
      }
      params.delete('view');
    }

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.replace(href, { scroll: false });
  };

  const handleTypeChange = (next: CollectionType) => {
    if (collectionType === next) return;
    setCollectionType(next);
    if (!pathname) return;
    const params = new URLSearchParams(
      searchParams ? searchParams.toString() : undefined
    );
    if (next === 'sets') {
      params.delete('type');
    } else {
      params.set('type', next);
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.replace(href, { scroll: false });
  };

  return (
    <section className="mb-8 px-4">
      <div className="mx-auto w-full max-w-7xl">
        <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <FilterBar>
            {hasAnyItems && (
              <>
                <div className="flex shrink-0 flex-col gap-1">
                  <span className="text-xs font-medium text-foreground-muted">
                    List
                  </span>
                  <Select
                    id="public-list-filter"
                    size="sm"
                    className="min-w-[100px]"
                    value={collectionFilter}
                    onChange={event =>
                      handleFilterChange(event.target.value as CollectionFilter)
                    }
                  >
                    <option value="all">All</option>
                    <option value="owned">Owned</option>
                    <option value="wishlist">Wishlist</option>
                    {lists.map(list => (
                      <option
                        key={list.id}
                        value={makeCustomListFilter(list.id)}
                      >
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {collectionType === 'sets' && hasAnySets && (
                  <>
                    <div className="flex shrink-0 flex-col gap-1">
                      <span className="text-xs font-medium text-foreground-muted">
                        Theme
                      </span>
                      <Select
                        id="public-theme-filter"
                        size="sm"
                        className="min-w-[120px]"
                        value={
                          themeFilter === 'all' ? 'all' : String(themeFilter)
                        }
                        onChange={event => {
                          const v = event.target.value;
                          if (v === 'all') {
                            setThemeFilter('all');
                          } else {
                            const parsed = Number(v);
                            setThemeFilter(
                              Number.isFinite(parsed) ? parsed : 'all'
                            );
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
                    <div className="flex shrink-0 flex-col gap-1">
                      <span className="text-xs font-medium text-foreground-muted">
                        Group
                      </span>
                      <SegmentedControl
                        size="sm"
                        segments={[
                          { key: 'status', label: 'Collection' },
                          { key: 'theme', label: 'Theme' },
                        ]}
                        value={groupBy}
                        onChange={key => setGroupBy(key as GroupBy)}
                      />
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex shrink-0 flex-col gap-1">
              <span className="text-xs font-medium text-foreground-muted">
                Type
              </span>
              <SegmentedControl
                size="sm"
                segments={[
                  { key: 'sets', label: 'Sets' },
                  { key: 'minifigs', label: 'Minifigs' },
                ]}
                value={collectionType}
                onChange={key => handleTypeChange(key as CollectionType)}
              />
            </div>
          </FilterBar>
        </div>

        {!hasAnyItems && (
          <div className="mt-2 text-sm text-foreground-muted">
            No public items to show yet.
          </div>
        )}

        {collectionType === 'sets' &&
          hasAnySets &&
          filteredSets.length === 0 && (
            <div className="mt-2 text-sm text-foreground-muted">
              No sets match the current filters.
            </div>
          )}

        {collectionType === 'minifigs' &&
          hasAnyMinifigs &&
          filteredMinifigs.length === 0 && (
            <div className="mt-2 text-sm text-foreground-muted">
              No minifigures match the current filters.
            </div>
          )}

        {collectionType === 'sets' && hasAnySets && filteredSets.length > 0 && (
          <div className="mt-4 flex flex-col gap-6">
            {groupedSets.map(group => (
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

        {collectionType === 'minifigs' &&
          hasAnyMinifigs &&
          filteredMinifigs.length > 0 && (
            <div className="mt-4 flex flex-col gap-6">
              {groupedMinifigs.map(group => (
                <div key={group.label} className="flex flex-col gap-2">
                  <CollectionGroupHeading>{group.label}</CollectionGroupHeading>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {group.items.map(fig => (
                      <PublicMinifigCard
                        key={fig.fig_num}
                        figNum={fig.fig_num}
                        name={fig.name ?? fig.fig_num}
                        imageUrl={fig.image_url ?? null}
                        blId={fig.bl_id ?? null}
                        numParts={fig.num_parts}
                        status={fig.status}
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
