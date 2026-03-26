'use client';

import { Button } from '@/app/components/ui/Button';
import { ClearAllButton } from '@/app/components/ui/ClearAllButton';
import { ControlBar } from '@/app/components/ui/ControlBar';
import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
  type DropdownOption,
} from '@/app/components/ui/GroupedDropdown';
import { Modal } from '@/app/components/ui/Modal';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { useControlBarDropdown } from '@/app/hooks/useControlBarDropdown';
import { CollectionCategoryPanel } from './CollectionCategoryPanel';
import {
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
import { useState } from 'react';
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
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
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
  parentOptions,
  subcategoriesByParent,
  colorOptions,
  filter,
  onFilterChange,
}: Props) {
  const { openDropdownId, toggleDropdown, closeDropdown, containerRef } =
    useControlBarDropdown();

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const categoryLabel =
    filter.parents.length === 0
      ? 'Category'
      : filter.parents.length === 1
        ? filter.parents[0]!
        : `Category (${filter.parents.length})`;

  const colorLabel =
    filter.colors.length === 0
      ? 'Color'
      : filter.colors.length === 1
        ? filter.colors[0]!
        : `Color (${filter.colors.length})`;

  function toggleColor(color: string) {
    const exists = filter.colors.includes(color);
    onFilterChange({
      ...filter,
      colors: exists
        ? filter.colors.filter(c => c !== color)
        : [...filter.colors, color],
    });
  }

  return (
    <ControlBar containerRef={containerRef}>
      {/* Source filter */}
      <div className="shrink-0 lg:relative">
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
      {parentOptions.length > 0 && (
        <div className="shrink-0 lg:relative">
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
            <CollectionCategoryPanel
              filter={filter}
              onFilterChange={onFilterChange}
              parentOptions={parentOptions}
              subcategoriesByParent={subcategoriesByParent}
            />
          </DropdownPanelFrame>
        </div>
      )}

      {/* Color filter */}
      {colorOptions.length > 0 && (
        <div className="shrink-0 lg:relative">
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
            <DropdownSection>
              <div>
                {colorOptions.map(color => {
                  const selected = filter.colors.includes(color);
                  return (
                    <RowButton
                      key={color}
                      selected={selected}
                      onClick={() => toggleColor(color)}
                      className="border-b border-foreground-accent"
                    >
                      <RowCheckbox checked={selected} />
                      <span>{color}</span>
                    </RowButton>
                  );
                })}
              </div>
            </DropdownSection>
            {filter.colors.length > 0 && (
              <ClearAllButton
                onClick={() => onFilterChange({ ...filter, colors: [] })}
              />
            )}
          </DropdownPanelFrame>
        </div>
      )}

      {/* Sort + Group By */}
      <div className="shrink-0 lg:relative">
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

      {/* View */}
      <div className="shrink-0 lg:relative">
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

      {/* Export */}
      <Button
        variant="secondary"
        size="sm"
        onClick={onExport}
        disabled={isExportDisabled || selectionCount === 0}
        className="min-w-max shrink-0"
      >
        <Download size={16} />
        {selectionCount > 0 ? `Export (${selectionCount})` : 'Export'}
      </Button>

      {/* Clear Selections */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setConfirmClearOpen(true)}
        disabled={selectionCount === 0}
        className="min-w-max shrink-0"
      >
        <X size={16} />
        {selectionCount > 0 ? `Clear (${selectionCount})` : 'Clear'}
      </Button>

      {/* Clear confirmation modal */}
      <Modal
        open={confirmClearOpen}
        title="Clear selections"
        onClose={() => setConfirmClearOpen(false)}
      >
        <p className="text-sm text-foreground-muted">
          Clear all {selectionCount} selected part
          {selectionCount !== 1 ? 's' : ''}? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClearOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              onClearSelections();
              setConfirmClearOpen(false);
            }}
          >
            Clear all
          </Button>
        </div>
      </Modal>
    </ControlBar>
  );
}
