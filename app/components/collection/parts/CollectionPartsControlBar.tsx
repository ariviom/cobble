'use client';

import { Button } from '@/app/components/ui/Button';
import { ControlBar } from '@/app/components/ui/ControlBar';
import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
  type DropdownOption,
} from '@/app/components/ui/GroupedDropdown';
import { useControlBarDropdown } from '@/app/hooks/useControlBarDropdown';
import {
  ArrowDownUp,
  Download,
  Filter,
  Grid,
  LayoutGrid,
  List,
  Palette,
  SortAsc,
  Tag,
  X,
} from 'lucide-react';
import type { PartsFilter, PartsSourceFilter, PartsSortKey } from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const sourceOptions: DropdownOption[] = [
  { key: 'all', text: 'All Parts' },
  { key: 'owned', text: 'Owned' },
  { key: 'loose', text: 'Loose' },
  { key: 'missing', text: 'Missing' },
];

const sortKeyOptions: DropdownOption[] = [
  { key: 'name', text: 'Name' },
  { key: 'color', text: 'Color' },
  { key: 'category', text: 'Category' },
  { key: 'quantity', text: 'Quantity' },
];

const sortDirOptions: DropdownOption[] = [
  { key: 'asc', text: 'Ascending' },
  { key: 'desc', text: 'Descending' },
];

const groupByOptions: DropdownOption[] = [
  { key: 'none', text: 'None' },
  { key: 'color', text: 'Color' },
  { key: 'category', text: 'Category' },
];

const viewOptions: DropdownOption[] = [
  { key: 'list', text: 'List', icon: <List size={16} /> },
  { key: 'grid', text: 'Grid', icon: <LayoutGrid size={16} /> },
  { key: 'micro', text: 'Thumbnail', icon: <Grid size={16} /> },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelFor(options: DropdownOption[], key: string): string {
  return options.find(o => o.key === key)?.text ?? key;
}

function viewIcon(view: 'list' | 'grid' | 'micro') {
  if (view === 'micro') return <Grid size={16} />;
  if (view === 'grid') return <LayoutGrid size={16} />;
  return <List size={16} />;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  sourceFilter: PartsSourceFilter;
  onSourceFilterChange: (source: PartsSourceFilter) => void;
  sortKey: PartsSortKey;
  onSortKeyChange: (key: PartsSortKey) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
  groupBy: 'none' | 'color' | 'category';
  onGroupByChange: (g: 'none' | 'color' | 'category') => void;
  view: 'list' | 'grid' | 'micro';
  onViewChange: (v: 'list' | 'grid' | 'micro') => void;
  selectionCount: number;
  onExport: () => void;
  onClearSelections: () => void;
  isExportDisabled: boolean;
  categoryOptions: string[];
  colorOptions: string[];
  filter: PartsFilter;
  onFilterChange: (f: PartsFilter) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollectionPartsControlBar({
  sourceFilter,
  onSourceFilterChange,
  sortKey,
  onSortKeyChange,
  sortDir,
  onToggleSortDir,
  groupBy,
  onGroupByChange,
  view,
  onViewChange,
  selectionCount,
  onExport,
  onClearSelections,
  isExportDisabled,
  categoryOptions,
  colorOptions,
  filter,
  onFilterChange,
}: Props) {
  const { openDropdownId, toggleDropdown, closeDropdown, containerRef } =
    useControlBarDropdown();

  const categoryOptionsWithAll: DropdownOption[] = [
    { key: 'all', text: 'All Categories' },
    ...categoryOptions.map(c => ({ key: c, text: c })),
  ];

  const colorOptionsWithAll: DropdownOption[] = [
    { key: 'all', text: 'All Colors' },
    ...colorOptions.map(c => ({ key: c, text: c })),
  ];

  // Derive single selected category / color for display (first selected or 'all')
  const selectedCategory =
    filter.categories.length === 1 ? filter.categories[0]! : 'all';
  const selectedColor = filter.colors.length === 1 ? filter.colors[0]! : 'all';

  const categoryLabel =
    filter.categories.length === 0
      ? 'Category'
      : filter.categories.length === 1
        ? filter.categories[0]!
        : `Category (${filter.categories.length})`;

  const colorLabel =
    filter.colors.length === 0
      ? 'Color'
      : filter.colors.length === 1
        ? filter.colors[0]!
        : `Color (${filter.colors.length})`;

  return (
    <ControlBar containerRef={containerRef}>
      {/* Source filter */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="parts-source-trigger"
          panelId="parts-source-panel"
          label={labelFor(sourceOptions, sourceFilter)}
          labelIcon={<Filter size={16} />}
          isOpen={openDropdownId === 'source'}
          onToggle={() => toggleDropdown('source')}
        />
        <DropdownPanelFrame
          id="parts-source-panel"
          labelledBy="parts-source-trigger"
          isOpen={openDropdownId === 'source'}
        >
          <SingleSelectList
            options={sourceOptions}
            selectedKey={sourceFilter}
            onChange={key => {
              onSourceFilterChange(key as PartsSourceFilter);
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* Category filter */}
      {categoryOptions.length > 0 && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="parts-category-trigger"
            panelId="parts-category-panel"
            label={categoryLabel}
            labelIcon={<Tag size={16} />}
            isOpen={openDropdownId === 'category'}
            onToggle={() => toggleDropdown('category')}
          />
          <DropdownPanelFrame
            id="parts-category-panel"
            labelledBy="parts-category-trigger"
            isOpen={openDropdownId === 'category'}
          >
            <SingleSelectList
              options={categoryOptionsWithAll}
              selectedKey={selectedCategory}
              onChange={key => {
                if (key === 'all') {
                  onFilterChange({ ...filter, categories: [] });
                } else {
                  onFilterChange({ ...filter, categories: [key] });
                }
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Color filter */}
      {colorOptions.length > 0 && (
        <div className="relative shrink-0">
          <DropdownTrigger
            id="parts-color-trigger"
            panelId="parts-color-panel"
            label={colorLabel}
            labelIcon={<Palette size={16} />}
            isOpen={openDropdownId === 'color'}
            onToggle={() => toggleDropdown('color')}
          />
          <DropdownPanelFrame
            id="parts-color-panel"
            labelledBy="parts-color-trigger"
            isOpen={openDropdownId === 'color'}
          >
            <SingleSelectList
              options={colorOptionsWithAll}
              selectedKey={selectedColor}
              onChange={key => {
                if (key === 'all') {
                  onFilterChange({ ...filter, colors: [] });
                } else {
                  onFilterChange({ ...filter, colors: [key] });
                }
                closeDropdown();
              }}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Sort + Group By */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="parts-sort-trigger"
          panelId="parts-sort-panel"
          label={labelFor(sortKeyOptions, sortKey)}
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => toggleDropdown('sort')}
        />
        <DropdownPanelFrame
          id="parts-sort-panel"
          labelledBy="parts-sort-trigger"
          isOpen={openDropdownId === 'sort'}
        >
          <GroupedList
            sections={[
              {
                id: 'sortBy',
                label: 'Sort By',
                options: sortKeyOptions,
                selectedKey: sortKey,
                onChange: key => {
                  onSortKeyChange(key as PartsSortKey);
                  closeDropdown();
                },
              },
              {
                id: 'order',
                label: 'Order',
                options: sortDirOptions,
                selectedKey: sortDir,
                onChange: () => {
                  onToggleSortDir();
                  closeDropdown();
                },
              },
              {
                id: 'groupBy',
                label: 'Group By',
                options: groupByOptions,
                selectedKey: groupBy,
                onChange: key => {
                  onGroupByChange(key as 'none' | 'color' | 'category');
                  closeDropdown();
                },
              },
            ]}
          />
        </DropdownPanelFrame>
      </div>

      {/* Sort direction toggle */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="parts-sortdir-trigger"
          panelId="parts-sortdir-panel"
          label={labelFor(sortDirOptions, sortDir)}
          labelIcon={<ArrowDownUp size={16} />}
          isOpen={openDropdownId === 'sortdir'}
          onToggle={() => toggleDropdown('sortdir')}
        />
        <DropdownPanelFrame
          id="parts-sortdir-panel"
          labelledBy="parts-sortdir-trigger"
          isOpen={openDropdownId === 'sortdir'}
        >
          <SingleSelectList
            options={sortDirOptions}
            selectedKey={sortDir}
            onChange={key => {
              if (key !== sortDir) onToggleSortDir();
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* View */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="parts-view-trigger"
          panelId="parts-view-panel"
          label={labelFor(viewOptions, view)}
          labelIcon={viewIcon(view)}
          isOpen={openDropdownId === 'view'}
          onToggle={() => toggleDropdown('view')}
        />
        <DropdownPanelFrame
          id="parts-view-panel"
          labelledBy="parts-view-trigger"
          isOpen={openDropdownId === 'view'}
        >
          <DropdownSection label="View">
            <SingleSelectList
              options={viewOptions}
              selectedKey={view}
              onChange={key => {
                onViewChange(key as 'list' | 'grid' | 'micro');
                closeDropdown();
              }}
            />
          </DropdownSection>
        </DropdownPanelFrame>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clear Selections */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelections}
        disabled={selectionCount === 0}
        className="shrink-0"
      >
        <X size={14} />
        <span>
          {selectionCount > 0 ? `Clear (${selectionCount})` : 'Clear'}
        </span>
      </Button>

      {/* Export */}
      <Button
        variant="secondary"
        size="sm"
        onClick={onExport}
        disabled={isExportDisabled || selectionCount === 0}
        className="relative shrink-0"
      >
        <Download size={14} />
        <span>Export</span>
        {selectionCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-theme-primary px-1 text-2xs font-bold text-theme-primary-contrast">
            {selectionCount}
          </span>
        )}
      </Button>
    </ControlBar>
  );
}
