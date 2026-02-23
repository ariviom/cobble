'use client';

import { ControlBar } from '@/app/components/ui/ControlBar';
import {
  DropdownPanelFrame,
  DropdownTrigger,
  SingleSelectList,
  type DropdownOption,
} from '@/app/components/ui/GroupedDropdown';
import { useControlBarDropdown } from '@/app/hooks/useControlBarDropdown';
import { ArrowUpDown, Filter, Layers, SortAsc, Tag } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CustomListFilter = `list:${string}`;
export type ListFilter = 'all' | 'owned' | 'wishlist' | CustomListFilter;
export type CollectionSortField = 'collection' | 'theme' | 'year' | 'pieces';
export type MinifigSortField = 'collection' | 'category';
export type SortDir = 'asc' | 'desc';
export type CollectionType = 'sets' | 'minifigs';

type ListInfo = { id: string; name: string };
type ThemeOption = { id: number; name: string };
type CategoryOption = { id: number; name: string };

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const typeOptions: DropdownOption[] = [
  { key: 'sets', text: 'Sets' },
  { key: 'minifigs', text: 'Minifigs' },
];

const setsSortOptions: DropdownOption[] = [
  { key: 'collection', text: 'Collection' },
  { key: 'theme', text: 'Theme' },
  { key: 'year', text: 'Year' },
  { key: 'pieces', text: 'Pieces' },
];

const minifigSortOptions: DropdownOption[] = [
  { key: 'collection', text: 'Collection' },
  { key: 'category', text: 'Theme' },
];

const orderOptions: DropdownOption[] = [
  { key: 'asc', text: 'Ascending' },
  { key: 'desc', text: 'Descending' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildListOptions(lists: ListInfo[]): DropdownOption[] {
  const opts: DropdownOption[] = [
    { key: 'all', text: 'All' },
    { key: 'owned', text: 'Owned' },
    { key: 'wishlist', text: 'Wishlist' },
  ];
  for (const list of lists) {
    opts.push({ key: `list:${list.id}`, text: list.name });
  }
  return opts;
}

function buildThemeOptions(themes: ThemeOption[]): DropdownOption[] {
  const opts: DropdownOption[] = [{ key: 'all', text: 'All Themes' }];
  for (const t of themes) {
    opts.push({ key: String(t.id), text: t.name });
  }
  return opts;
}

function buildCategoryOptions(categories: CategoryOption[]): DropdownOption[] {
  const opts: DropdownOption[] = [{ key: 'all', text: 'All Themes' }];
  for (const c of categories) {
    opts.push({ key: String(c.id), text: c.name });
  }
  return opts;
}

function listFilterLabel(value: ListFilter, lists: ListInfo[]): string {
  if (value === 'all') return 'All Collections';
  if (value === 'owned') return 'Owned';
  if (value === 'wishlist') return 'Wishlist';
  const id = value.replace('list:', '');
  const match = lists.find(l => l.id === id);
  return match?.name ?? 'List';
}

function themeFilterLabel(
  value: number | 'all',
  themes: ThemeOption[]
): string {
  if (value === 'all') return 'All Themes';
  const match = themes.find(t => t.id === value);
  return match?.name ?? 'Theme';
}

function categoryFilterLabel(
  value: number | 'all',
  categories: CategoryOption[]
): string {
  if (value === 'all') return 'All Themes';
  const match = categories.find(c => c.id === value);
  return match?.name ?? 'Theme';
}

function labelFor(options: DropdownOption[], key: string): string {
  return options.find(o => o.key === key)?.text ?? key;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type CollectionControlBarProps = {
  collectionType: CollectionType;
  onCollectionTypeChange: (next: CollectionType) => void;
  listFilter: ListFilter;
  onListFilterChange: (next: ListFilter) => void;
  lists: ListInfo[];
  listsLoading: boolean;
  // Sets-specific
  hasAnySets: boolean;
  themeFilter: number | 'all';
  onThemeFilterChange: (next: number | 'all') => void;
  themeOptions: ThemeOption[];
  sortField: CollectionSortField;
  onSortFieldChange: (next: CollectionSortField) => void;
  sortDir: SortDir;
  onSortDirChange: (next: SortDir) => void;
  // Minifigs-specific
  hasAnyMinifigs: boolean;
  categoryFilter: number | 'all';
  onCategoryFilterChange: (next: number | 'all') => void;
  categoryOptions: CategoryOption[];
  minifigSortField: MinifigSortField;
  onMinifigSortFieldChange: (next: MinifigSortField) => void;
  minifigSortDir: SortDir;
  onMinifigSortDirChange: (next: SortDir) => void;
};

export function CollectionControlBar({
  collectionType,
  onCollectionTypeChange,
  listFilter,
  onListFilterChange,
  lists,
  listsLoading,
  hasAnySets,
  themeFilter,
  onThemeFilterChange,
  themeOptions,
  sortField,
  onSortFieldChange,
  sortDir,
  onSortDirChange,
  hasAnyMinifigs,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  minifigSortField,
  onMinifigSortFieldChange,
  minifigSortDir,
  onMinifigSortDirChange,
}: CollectionControlBarProps) {
  const { openDropdownId, toggleDropdown, closeDropdown, containerRef } =
    useControlBarDropdown();

  const hasAnyItems = collectionType === 'sets' ? hasAnySets : hasAnyMinifigs;

  const listOptions = buildListOptions(lists);

  const showSetsOrder = collectionType === 'sets' && hasAnySets;
  const showMinifigsOrder = collectionType === 'minifigs' && hasAnyMinifigs;

  return (
    <ControlBar containerRef={containerRef}>
      {/* Type toggle */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="coll-type-trigger"
          panelId="coll-type-panel"
          label={collectionType === 'sets' ? 'Sets' : 'Minifigs'}
          labelIcon={<Layers size={16} />}
          isOpen={openDropdownId === 'type'}
          onToggle={() => toggleDropdown('type')}
        />
        <DropdownPanelFrame
          id="coll-type-panel"
          labelledBy="coll-type-trigger"
          isOpen={openDropdownId === 'type'}
        >
          <SingleSelectList
            options={typeOptions}
            selectedKey={collectionType}
            onChange={key => {
              onCollectionTypeChange(key as CollectionType);
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* Sort field — sets */}
      {collectionType === 'sets' && hasAnySets && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-sort-trigger"
            panelId="coll-sort-panel"
            label={labelFor(setsSortOptions, sortField)}
            labelIcon={<SortAsc size={16} />}
            isOpen={openDropdownId === 'sort'}
            onToggle={() => toggleDropdown('sort')}
          />
          <DropdownPanelFrame
            id="coll-sort-panel"
            labelledBy="coll-sort-trigger"
            isOpen={openDropdownId === 'sort'}
          >
            <SingleSelectList
              options={setsSortOptions}
              selectedKey={sortField}
              onChange={key => {
                onSortFieldChange(key as CollectionSortField);
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Sort field — minifigs */}
      {collectionType === 'minifigs' && hasAnyMinifigs && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-mfsort-trigger"
            panelId="coll-mfsort-panel"
            label={labelFor(minifigSortOptions, minifigSortField)}
            labelIcon={<SortAsc size={16} />}
            isOpen={openDropdownId === 'mfsort'}
            onToggle={() => toggleDropdown('mfsort')}
          />
          <DropdownPanelFrame
            id="coll-mfsort-panel"
            labelledBy="coll-mfsort-trigger"
            isOpen={openDropdownId === 'mfsort'}
          >
            <SingleSelectList
              options={minifigSortOptions}
              selectedKey={minifigSortField}
              onChange={key => {
                onMinifigSortFieldChange(key as MinifigSortField);
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Order — sets */}
      {showSetsOrder && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-order-trigger"
            panelId="coll-order-panel"
            label={labelFor(orderOptions, sortDir)}
            labelIcon={<ArrowUpDown size={16} />}
            isOpen={openDropdownId === 'order'}
            onToggle={() => toggleDropdown('order')}
          />
          <DropdownPanelFrame
            id="coll-order-panel"
            labelledBy="coll-order-trigger"
            isOpen={openDropdownId === 'order'}
          >
            <SingleSelectList
              options={orderOptions}
              selectedKey={sortDir}
              onChange={key => {
                onSortDirChange(key as SortDir);
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Order — minifigs */}
      {showMinifigsOrder && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-mforder-trigger"
            panelId="coll-mforder-panel"
            label={labelFor(orderOptions, minifigSortDir)}
            labelIcon={<ArrowUpDown size={16} />}
            isOpen={openDropdownId === 'mforder'}
            onToggle={() => toggleDropdown('mforder')}
          />
          <DropdownPanelFrame
            id="coll-mforder-panel"
            labelledBy="coll-mforder-trigger"
            isOpen={openDropdownId === 'mforder'}
          >
            <SingleSelectList
              options={orderOptions}
              selectedKey={minifigSortDir}
              onChange={key => {
                onMinifigSortDirChange(key as SortDir);
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Theme / Category filter */}
      {collectionType === 'sets' && hasAnySets && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-theme-trigger"
            panelId="coll-theme-panel"
            label={themeFilterLabel(themeFilter, themeOptions)}
            labelIcon={<Tag size={16} />}
            isOpen={openDropdownId === 'theme'}
            onToggle={() => toggleDropdown('theme')}
          />
          <DropdownPanelFrame
            id="coll-theme-panel"
            labelledBy="coll-theme-trigger"
            isOpen={openDropdownId === 'theme'}
          >
            <SingleSelectList
              options={buildThemeOptions(themeOptions)}
              selectedKey={themeFilter === 'all' ? 'all' : String(themeFilter)}
              onChange={key => {
                onThemeFilterChange(key === 'all' ? 'all' : Number(key));
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {collectionType === 'minifigs' && hasAnyMinifigs && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-cat-trigger"
            panelId="coll-cat-panel"
            label={categoryFilterLabel(categoryFilter, categoryOptions)}
            labelIcon={<Tag size={16} />}
            isOpen={openDropdownId === 'category'}
            onToggle={() => toggleDropdown('category')}
          />
          <DropdownPanelFrame
            id="coll-cat-panel"
            labelledBy="coll-cat-trigger"
            isOpen={openDropdownId === 'category'}
          >
            <SingleSelectList
              options={buildCategoryOptions(categoryOptions)}
              selectedKey={
                categoryFilter === 'all' ? 'all' : String(categoryFilter)
              }
              onChange={key => {
                onCategoryFilterChange(key === 'all' ? 'all' : Number(key));
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Collection / List filter */}
      {hasAnyItems && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="coll-list-trigger"
            panelId="coll-list-panel"
            label={`${listFilterLabel(listFilter, lists)}${listsLoading && lists.length === 0 ? ' …' : ''}`}
            labelIcon={<Filter size={16} />}
            isOpen={openDropdownId === 'list'}
            onToggle={() => toggleDropdown('list')}
          />
          <DropdownPanelFrame
            id="coll-list-panel"
            labelledBy="coll-list-trigger"
            isOpen={openDropdownId === 'list'}
          >
            <SingleSelectList
              options={listOptions}
              selectedKey={listFilter}
              onChange={key => {
                onListFilterChange(key as ListFilter);
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}
    </ControlBar>
  );
}
