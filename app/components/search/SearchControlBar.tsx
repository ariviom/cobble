'use client';

import { ControlBar } from '@/app/components/ui/ControlBar';
import {
  DropdownPanelFrame,
  DropdownTrigger,
  SingleSelectList,
  type DropdownOption,
} from '@/app/components/ui/GroupedDropdown';
import { useControlBarDropdown } from '@/app/hooks/useControlBarDropdown';
import type {
  FilterType,
  MinifigSortOption,
  SortOption,
} from '@/app/types/search';
import { ArrowUpDown, Filter, Hash, SortAsc, Target } from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared sort field + direction model
// ---------------------------------------------------------------------------

export type SortField = 'relevance' | 'year' | 'pieces' | 'theme';
export type SortDir = 'asc' | 'desc';

/** Combine field + direction into the API SortOption string. */
export function toSortOption(field: SortField, dir: SortDir): SortOption {
  if (field === 'relevance') return 'relevance';
  return `${field}-${dir}` as SortOption;
}

/** Split an API SortOption into field + direction. */
export function fromSortOption(opt: SortOption): {
  field: SortField;
  dir: SortDir;
} {
  if (opt === 'relevance') return { field: 'relevance', dir: 'desc' };
  const parts = opt.split('-');
  return {
    field: parts[0] as SortField,
    dir: parts[1] as SortDir,
  };
}

// ---------------------------------------------------------------------------
// Set search options
// ---------------------------------------------------------------------------

const sortFieldOptions: DropdownOption[] = [
  { key: 'relevance', text: 'Relevance' },
  { key: 'year', text: 'Year' },
  { key: 'pieces', text: 'Pieces' },
  { key: 'theme', text: 'Theme' },
];

const orderOptions: DropdownOption[] = [
  { key: 'asc', text: 'Ascending' },
  { key: 'desc', text: 'Descending' },
];

const showOptions: DropdownOption[] = [
  { key: '20', text: 'Show 20' },
  { key: '50', text: 'Show 50' },
  { key: '100', text: 'Show 100' },
];

const filterOptions: DropdownOption[] = [
  { key: 'all', text: 'All' },
  { key: 'set', text: 'Set' },
  { key: 'theme', text: 'Theme' },
  { key: 'subtheme', text: 'Subtheme' },
];

const exactOptions: DropdownOption[] = [
  { key: 'on', text: 'On' },
  { key: 'off', text: 'Off' },
];

// ---------------------------------------------------------------------------
// Minifig search options
// ---------------------------------------------------------------------------

const minifigSortOptions: DropdownOption[] = [
  { key: 'relevance', text: 'Relevance' },
  { key: 'theme-asc', text: 'Theme A–Z' },
  { key: 'theme-desc', text: 'Theme Z–A' },
  { key: 'name-asc', text: 'Name A–Z' },
  { key: 'name-desc', text: 'Name Z–A' },
  { key: 'parts-desc', text: 'Parts ↓' },
  { key: 'parts-asc', text: 'Parts ↑' },
];

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function labelFor(options: DropdownOption[], key: string): string {
  return options.find(o => o.key === key)?.text ?? key;
}

// ---------------------------------------------------------------------------
// Set search control bar
// ---------------------------------------------------------------------------

type SetSearchControlBarProps = {
  sort: SortOption;
  onSortChange: (next: SortOption) => void;
  pageSize: number;
  onPageSizeChange: (next: number) => void;
  filter: FilterType;
  onFilterChange: (next: FilterType) => void;
  exact: boolean;
  onExactChange: (next: boolean) => void;
};

export function SetSearchControlBar({
  sort,
  onSortChange,
  pageSize,
  onPageSizeChange,
  filter,
  onFilterChange,
  exact,
  onExactChange,
}: SetSearchControlBarProps) {
  const { openDropdownId, toggleDropdown, closeDropdown, containerRef } =
    useControlBarDropdown();

  const { field, dir } = fromSortOption(sort);

  const handleFieldChange = (nextField: SortField) => {
    onSortChange(toSortOption(nextField, dir));
  };

  const handleDirChange = (nextDir: SortDir) => {
    onSortChange(toSortOption(field, nextDir));
  };

  return (
    <ControlBar containerRef={containerRef}>
      {/* Sort field */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="search-sort-trigger"
          panelId="search-sort-panel"
          label={labelFor(sortFieldOptions, field)}
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => toggleDropdown('sort')}
        />
        <DropdownPanelFrame
          id="search-sort-panel"
          labelledBy="search-sort-trigger"
          isOpen={openDropdownId === 'sort'}
        >
          <SingleSelectList
            options={sortFieldOptions}
            selectedKey={field}
            onChange={key => {
              handleFieldChange(key as SortField);
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* Order (asc/desc) — hidden when sorting by relevance */}
      {field !== 'relevance' && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="search-order-trigger"
            panelId="search-order-panel"
            label={labelFor(orderOptions, dir)}
            labelIcon={<ArrowUpDown size={16} />}
            isOpen={openDropdownId === 'order'}
            onToggle={() => toggleDropdown('order')}
          />
          <DropdownPanelFrame
            id="search-order-panel"
            labelledBy="search-order-trigger"
            isOpen={openDropdownId === 'order'}
          >
            <SingleSelectList
              options={orderOptions}
              selectedKey={dir}
              onChange={key => {
                handleDirChange(key as SortDir);
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Show (page size) */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="search-show-trigger"
          panelId="search-show-panel"
          label={`Show ${pageSize}`}
          labelIcon={<Hash size={16} />}
          isOpen={openDropdownId === 'show'}
          onToggle={() => toggleDropdown('show')}
        />
        <DropdownPanelFrame
          id="search-show-panel"
          labelledBy="search-show-trigger"
          isOpen={openDropdownId === 'show'}
        >
          <SingleSelectList
            options={showOptions}
            selectedKey={String(pageSize)}
            onChange={key => {
              onPageSizeChange(Number(key));
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* Filter */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="search-filter-trigger"
          panelId="search-filter-panel"
          label={labelFor(filterOptions, filter)}
          labelIcon={<Filter size={16} />}
          isOpen={openDropdownId === 'filter'}
          onToggle={() => toggleDropdown('filter')}
        />
        <DropdownPanelFrame
          id="search-filter-panel"
          labelledBy="search-filter-trigger"
          isOpen={openDropdownId === 'filter'}
        >
          <SingleSelectList
            options={filterOptions}
            selectedKey={filter}
            onChange={key => {
              onFilterChange(key as FilterType);
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* Exact match */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="search-exact-trigger"
          panelId="search-exact-panel"
          label={`Exact: ${exact ? 'On' : 'Off'}`}
          labelIcon={<Target size={16} />}
          isOpen={openDropdownId === 'exact'}
          onToggle={() => toggleDropdown('exact')}
        />
        <DropdownPanelFrame
          id="search-exact-panel"
          labelledBy="search-exact-trigger"
          isOpen={openDropdownId === 'exact'}
        >
          <SingleSelectList
            options={exactOptions}
            selectedKey={exact ? 'on' : 'off'}
            onChange={key => {
              onExactChange(key === 'on');
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>
    </ControlBar>
  );
}

// ---------------------------------------------------------------------------
// Minifig search control bar
// ---------------------------------------------------------------------------

type MinifigSearchControlBarProps = {
  sort: MinifigSortOption;
  onSortChange: (next: MinifigSortOption) => void;
};

export function MinifigSearchControlBar({
  sort,
  onSortChange,
}: MinifigSearchControlBarProps) {
  const { openDropdownId, toggleDropdown, closeDropdown, containerRef } =
    useControlBarDropdown();

  return (
    <ControlBar containerRef={containerRef}>
      <div className="relative shrink-0">
        <DropdownTrigger
          id="mf-sort-trigger"
          panelId="mf-sort-panel"
          label={labelFor(minifigSortOptions, sort)}
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => toggleDropdown('sort')}
        />
        <DropdownPanelFrame
          id="mf-sort-panel"
          labelledBy="mf-sort-trigger"
          isOpen={openDropdownId === 'sort'}
        >
          <SingleSelectList
            options={minifigSortOptions}
            selectedKey={sort}
            onChange={key => {
              onSortChange(key as MinifigSortOption);
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>
    </ControlBar>
  );
}

// ---------------------------------------------------------------------------
// Pieces grouping helper (shared with collection)
// ---------------------------------------------------------------------------

export function getPiecesBucket(numParts: number): string {
  if (numParts <= 50) return '1–50 pieces';
  if (numParts <= 100) return '51–100 pieces';
  if (numParts <= 500) return '101–500 pieces';
  if (numParts <= 1000) return '501–1000 pieces';
  return '1000+ pieces';
}

/** Numeric sort key for piece buckets so they sort in logical order. */
export function piecesBucketOrder(label: string): number {
  if (label.startsWith('1–')) return 0;
  if (label.startsWith('51')) return 1;
  if (label.startsWith('101')) return 2;
  if (label.startsWith('501')) return 3;
  return 4;
}
