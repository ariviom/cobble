'use client';

import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
} from '@/app/components/ui/GroupedDropdown';
import { useInventory } from '@/app/hooks/useInventory';
import { useOwnedStore } from '@/app/store/owned';
import { Filter, Grid, List, SortAsc } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clampOwned,
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from './inventory-utils';
import { InventoryControls } from './InventoryControls';
import { InventoryItem } from './items/InventoryItem';
import { SubcategoryToggleRail } from './SubcategoryToggleRail';
import type { GroupBy, InventoryFilter, ItemSize, ViewType } from './types';

type SortKey = 'name' | 'color' | 'size';

export function InventoryTable({
  setNumber,
  setName,
}: {
  setNumber: string;
  setName?: string;
}) {
  const { rows, isLoading, keys } = useInventory(setNumber);

  // UI state
  const [sortKey, setSortKey] = useState<SortKey>('color');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<InventoryFilter>({
    display: 'all',
    parent: null,
    subcategories: [],
    colors: [],
  });
  const [view, setView] = useState<ViewType>('list');
  const [itemSize, setItemSize] = useState<ItemSize>('md');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [openTopDropdown, setOpenTopDropdown] = useState<
    'display' | 'sort' | 'view' | null
  >(null);

  const ownedStore = useOwnedStore();

  useEffect(() => {
    // warm localStorage read
    keys.forEach(k => ownedStore.getOwned(setNumber, k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNumber, keys.join(',')]);

  // Do not early-return to preserve hooks order

  const sizeByIndex = useMemo(
    () => rows.map(r => parseStudAreaFromName(r.partName) ?? -1),
    [rows]
  );
  const categoryByIndex = useMemo(
    () => rows.map(r => r.partCategoryName ?? deriveCategory(r.partName)),
    [rows]
  );
  const parentByIndex = useMemo(
    () => rows.map(r => r.parentCategory ?? 'Misc'),
    [rows]
  );

  const visibleIndices = useMemo(() => {
    const idxs = rows.map((_, i) => i);
    const selectedParent = filter.parent;
    const subcategorySet =
      filter.subcategories.length > 0 ? new Set(filter.subcategories) : null;
    const colorSet =
      filter.colors && filter.colors.length > 0 ? new Set(filter.colors) : null;

    return idxs.filter(i => {
      const ownedValue = ownedStore.getOwned(setNumber, keys[i]!);
      if (filter.display === 'missing') {
        if (computeMissing(rows[i]!.quantityRequired, ownedValue) === 0)
          return false;
      } else if (filter.display === 'owned') {
        if (ownedValue === 0) return false;
      }

      if (selectedParent) {
        if (parentByIndex[i] !== selectedParent) return false;
        if (subcategorySet) {
          const category = categoryByIndex[i] ?? 'Uncategorized';
          if (!subcategorySet.has(category)) return false;
        }
      }

      if (colorSet) {
        const colorName = rows[i]!.colorName;
        if (!colorSet.has(colorName)) return false;
      }

      return true;
    });
  }, [
    rows,
    keys,
    categoryByIndex,
    parentByIndex,
    filter,
    ownedStore,
    setNumber,
  ]);

  const sortedIndices = useMemo(() => {
    const idxs = [...visibleIndices];

    function cmp(a: number, b: number): number {
      const ra = rows[a]!;
      const rb = rows[b]!;

      let base = 0;
      switch (sortKey) {
        case 'name':
          base = ra.partName.localeCompare(rb.partName);
          break;
        case 'color':
          base = ra.colorName.localeCompare(rb.colorName);
          break;
        case 'size': {
          const sa = sizeByIndex[a]!;
          const sb = sizeByIndex[b]!;
          base = sa - sb;
          break;
        }
      }

      // Secondary sort by name if equal
      if (base === 0) {
        base = ra.partName.localeCompare(rb.partName);
      }

      return sortDir === 'asc' ? base : -base;
    }

    idxs.sort(cmp);

    return idxs;
  }, [rows, sortKey, sortDir, sizeByIndex, visibleIndices]);

  const groupKeyByIndex = useMemo(() => {
    if (groupBy === 'none') return null;
    return rows.map((r, i) => {
      switch (groupBy) {
        case 'color':
          return r.colorName;
        case 'size':
          return String(sizeByIndex[i] ?? -1);
        case 'category':
          return (
            r.partCategoryName ??
            String(r.partCategoryId ?? deriveCategory(r.partName))
          );
        default:
          return '';
      }
    });
  }, [rows, sizeByIndex, groupBy]);

  const gridSizes = useMemo(() => {
    switch (itemSize) {
      case 'sm':
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9';
      case 'md':
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8';
      case 'lg':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
    }
  }, [itemSize]);

  // Persist UI state in localStorage (global, not per-set)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ui:inventoryControls');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        sortKey: typeof sortKey;
        sortDir: typeof sortDir;
        groupBy: typeof groupBy;
        view: typeof view;
        itemSize: typeof itemSize;
        display: InventoryFilter['display'];
      }>;
      if (parsed.sortKey) setSortKey(parsed.sortKey);
      if (parsed.sortDir) setSortDir(parsed.sortDir);
      if (parsed.groupBy) setGroupBy(parsed.groupBy);
      if (parsed.view) setView(parsed.view);
      if (parsed.itemSize) setItemSize(parsed.itemSize);
      if (parsed.display)
        setFilter(prev => ({
          ...prev,
          display: parsed.display!,
        }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const payload = {
        sortKey,
        sortDir,
        groupBy,
        view,
        itemSize,
        display: filter.display,
      };
      localStorage.setItem('ui:inventoryControls', JSON.stringify(payload));
    } catch {}
  }, [sortKey, sortDir, groupBy, view, itemSize, filter]);

  const subcategoryOptions = useMemo(() => {
    if (!filter.parent) return [] as string[];
    const parent = filter.parent;
    const set = new Set<string>();
    rows.forEach((row, idx) => {
      if (parentByIndex[idx] === parent) {
        set.add(categoryByIndex[idx] ?? 'Uncategorized');
      }
    });
    return Array.from(set).sort();
  }, [rows, parentByIndex, categoryByIndex, filter.parent]);

  const subcategoriesByParent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rows.forEach((row, idx) => {
      const parent = parentByIndex[idx] ?? 'Misc';
      const sub = categoryByIndex[idx] ?? 'Uncategorized';
      if (!map.has(parent)) map.set(parent, new Set());
      map.get(parent)!.add(sub);
    });
    const obj: Record<string, string[]> = {};
    for (const [parent, subs] of map.entries()) {
      obj[parent] = Array.from(subs).sort();
    }
    return obj;
  }, [rows, parentByIndex, categoryByIndex]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(row => set.add(row.colorName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <InventoryControls
        view={view}
        onChangeView={v => setView(v)}
        itemSize={itemSize}
        onChangeItemSize={s => setItemSize(s)}
        sortKey={sortKey}
        onChangeSortKey={k => setSortKey(k)}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
        groupBy={groupBy}
        onChangeGroupBy={g => setGroupBy(g)}
        filter={filter}
        onChangeFilter={f => setFilter(f)}
        parentOptions={useMemo(
          () => Array.from(new Set(parentByIndex)).filter(Boolean).sort(),
          [parentByIndex]
        )}
        onSelectParent={parent => {
          if (!parent) {
            setFilter(prev => ({
              ...prev,
              parent: null,
              subcategories: [],
            }));
          } else {
            setFilter(prev => ({
              ...prev,
              parent,
              subcategories: [],
            }));
          }
        }}
        subcategoryOptions={subcategoryOptions}
        subcategoriesByParent={subcategoriesByParent}
        onToggleSubcategory={subcategory => {
          if (!filter.parent) return;
          const exists = filter.subcategories.includes(subcategory);
          setFilter(prev => ({
            ...prev,
            subcategories: exists
              ? prev.subcategories.filter(c => c !== subcategory)
              : [...prev.subcategories, subcategory],
          }));
        }}
        onClearSubcategories={() =>
          setFilter(prev => ({ ...prev, subcategories: [] }))
        }
        colorOptions={colorOptions}
        onToggleColor={color => {
          setFilter(prev => {
            const exists = (prev.colors || []).includes(color);
            return {
              ...prev,
              colors: exists
                ? (prev.colors || []).filter(c => c !== color)
                : [...(prev.colors || []), color],
            };
          });
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100vh-var(--spacing-topnav-height))] lg:overflow-y-auto">
        {/* Desktop top controls: Display, Sort, View */}
        <div className="hidden lg:block">
          <div className="relative">
            <div className="flex items-center gap-2 border-b border-neutral-300 px-2 py-2">
              <DropdownTrigger
                id="top-display-trigger"
                panelId="top-display-panel"
                label={
                  filter.display === 'owned'
                    ? 'Owned'
                    : filter.display === 'missing'
                      ? 'Missing'
                      : 'All'
                }
                labelIcon={<Filter size={16} />}
                isOpen={openTopDropdown === 'display'}
                onToggle={() =>
                  setOpenTopDropdown(prev =>
                    prev === 'display' ? null : 'display'
                  )
                }
              />
              <DropdownTrigger
                id="top-sort-trigger"
                panelId="top-sort-panel"
                label="Sort"
                labelIcon={<SortAsc size={16} />}
                isOpen={openTopDropdown === 'sort'}
                onToggle={() =>
                  setOpenTopDropdown(prev => (prev === 'sort' ? null : 'sort'))
                }
              />
              <DropdownTrigger
                id="top-view-trigger"
                panelId="top-view-panel"
                label={view === 'grid' ? 'Grid' : 'List'}
                labelIcon={
                  view === 'grid' ? <Grid size={16} /> : <List size={16} />
                }
                isOpen={openTopDropdown === 'view'}
                onToggle={() =>
                  setOpenTopDropdown(prev => (prev === 'view' ? null : 'view'))
                }
              />
            </div>

            {/* Overlay panel under top controls */}
            {openTopDropdown && (
              <div className="absolute top-full right-0 left-0 z-40">
                {openTopDropdown === 'display' && (
                  <DropdownPanelFrame
                    id="top-display-panel"
                    labelledBy="top-display-trigger"
                    isOpen={true}
                    className="mx-2 mt-1"
                  >
                    <DropdownSection label="Filter By">
                      <SingleSelectList
                        options={[
                          { key: 'all', text: 'All' },
                          { key: 'missing', text: 'Missing' },
                          { key: 'owned', text: 'Owned' },
                        ]}
                        selectedKey={filter.display}
                        onChange={key => {
                          setFilter(prev => ({ ...prev, display: key as any }));
                          setOpenTopDropdown(null);
                        }}
                      />
                    </DropdownSection>
                  </DropdownPanelFrame>
                )}
                {openTopDropdown === 'sort' && (
                  <DropdownPanelFrame
                    id="top-sort-panel"
                    labelledBy="top-sort-trigger"
                    isOpen={true}
                    className="mx-2 mt-1"
                  >
                    <GroupedList
                      sections={[
                        {
                          id: 'sortBy',
                          label: 'Sort By',
                          options: [
                            { key: 'name', text: 'Name' },
                            { key: 'color', text: 'Color' },
                            { key: 'size', text: 'Size' },
                          ],
                          selectedKey: sortKey,
                          onChange: k => {
                            setSortKey(k as any);
                            setOpenTopDropdown(null);
                          },
                        },
                        {
                          id: 'order',
                          label: 'Order',
                          options: [
                            { key: 'asc', text: 'Ascending' },
                            { key: 'desc', text: 'Descending' },
                          ],
                          selectedKey: sortDir,
                          onChange: k => {
                            setSortDir(k as any);
                            setOpenTopDropdown(null);
                          },
                        },
                        {
                          id: 'groupBy',
                          label: 'Group By',
                          options: [
                            { key: 'none', text: 'None' },
                            { key: 'color', text: 'Color' },
                            { key: 'size', text: 'Size' },
                            { key: 'category', text: 'Category' },
                          ],
                          selectedKey: groupBy,
                          onChange: k => {
                            setGroupBy(k as any);
                            setOpenTopDropdown(null);
                          },
                        },
                      ]}
                    />
                  </DropdownPanelFrame>
                )}
                {openTopDropdown === 'view' && (
                  <DropdownPanelFrame
                    id="top-view-panel"
                    labelledBy="top-view-trigger"
                    isOpen={true}
                    className="mx-2 mt-1"
                  >
                    <DropdownSection label="View">
                      <SingleSelectList
                        options={[
                          {
                            key: 'list',
                            text: 'List',
                            icon: <List size={16} />,
                          },
                          {
                            key: 'grid',
                            text: 'Grid',
                            icon: <Grid size={16} />,
                          },
                        ]}
                        selectedKey={view}
                        onChange={k => {
                          setView(k as any);
                          setOpenTopDropdown(null);
                        }}
                      />
                    </DropdownSection>
                    <DropdownSection label="Size">
                      <SingleSelectList
                        options={[
                          { key: 'lg', text: 'Large' },
                          { key: 'md', text: 'Medium' },
                          { key: 'sm', text: 'Small' },
                        ]}
                        selectedKey={itemSize}
                        onChange={k => {
                          setItemSize(k as any);
                          setOpenTopDropdown(null);
                        }}
                      />
                    </DropdownSection>
                  </DropdownPanelFrame>
                )}
              </div>
            )}
          </div>
        </div>
        {filter.parent && subcategoryOptions.length > 1 ? (
          <SubcategoryToggleRail
            options={subcategoryOptions}
            selected={filter.subcategories}
            onToggle={subcategory => {
              if (!filter.parent) return;
              const exists = filter.subcategories.includes(subcategory);
              setFilter(prev => ({
                ...prev,
                subcategories: exists
                  ? prev.subcategories.filter(c => c !== subcategory)
                  : [...prev.subcategories, subcategory],
              }));
            }}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col p-2">
          {rows.length === 0 || isLoading ? (
            <div className="p-4 text-sm text-foreground-muted">
              {isLoading ? 'Loading…' : 'No inventory found.'}
            </div>
          ) : groupBy === 'none' ? (
            <div
              data-view={view}
              data-item-size={itemSize}
              className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
            >
              {sortedIndices.map(originalIndex => {
                const r = rows[originalIndex]!;
                const key = keys[originalIndex]!;
                const owned = ownedStore.getOwned(setNumber, key);
                const missing = computeMissing(r.quantityRequired, owned);
                return (
                  <InventoryItem
                    key={key}
                    row={r}
                    owned={owned}
                    missing={missing}
                    onOwnedChange={next => {
                      ownedStore.setOwned(
                        setNumber,
                        key,
                        clampOwned(next, r.quantityRequired)
                      );
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {(() => {
                const grouped = new Map<string, number[]>();
                for (const idx of sortedIndices) {
                  const k = groupKeyByIndex?.[idx] ?? '';
                  if (!grouped.has(k)) grouped.set(k, []);
                  grouped.get(k)!.push(idx);
                }
                const sections: Array<{ key: string; indices: number[] }> = [];
                for (const [k, v] of grouped.entries())
                  sections.push({ key: k, indices: v });
                sections.sort((a, b) => a.key.localeCompare(b.key));
                return sections.map(sec => (
                  <div key={sec.key} className="flex flex-col gap-2">
                    <div className="sticky top-0 z-10 bg-background/90 px-1 py-1 text-sm font-semibold text-foreground">
                      {sec.key}
                    </div>
                    <div
                      data-view={view}
                      data-item-size={itemSize}
                      className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
                    >
                      {sec.indices.map(originalIndex => {
                        const r = rows[originalIndex]!;
                        const key = keys[originalIndex]!;
                        const owned = ownedStore.getOwned(setNumber, key);
                        const missing = computeMissing(
                          r.quantityRequired,
                          owned
                        );
                        return (
                          <InventoryItem
                            key={key}
                            row={r}
                            owned={owned}
                            missing={missing}
                            onOwnedChange={next => {
                              ownedStore.setOwned(
                                setNumber,
                                key,
                                clampOwned(next, r.quantityRequired)
                              );
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
