'use client';

import { ControlBar } from '@/app/components/ui/ControlBar';
import {
  DropdownPanelFrame,
  DropdownTrigger,
  SingleSelectList,
  type DropdownOption,
} from '@/app/components/ui/GroupedDropdown';
import { useControlBarDropdown } from '@/app/hooks/useControlBarDropdown';
import { ArrowUpDown, SortAsc } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanBuildSortField = 'coverage' | 'theme' | 'year' | 'pieces';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const sortOptions: DropdownOption[] = [
  { key: 'coverage', text: 'Coverage' },
  { key: 'theme', text: 'Theme' },
  { key: 'year', text: 'Year' },
  { key: 'pieces', text: 'Pieces' },
];

const orderOptions: DropdownOption[] = [
  { key: 'asc', text: 'Ascending' },
  { key: 'desc', text: 'Descending' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelFor(options: DropdownOption[], key: string): string {
  return options.find(o => o.key === key)?.text ?? key;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type CanBuildControlBarProps = {
  sortField: CanBuildSortField;
  onSortFieldChange: (next: CanBuildSortField) => void;
  sortDir: SortDir;
  onSortDirChange: (next: SortDir) => void;
};

export function CanBuildControlBar({
  sortField,
  onSortFieldChange,
  sortDir,
  onSortDirChange,
}: CanBuildControlBarProps) {
  const { openDropdownId, toggleDropdown, closeDropdown, containerRef } =
    useControlBarDropdown();

  return (
    <ControlBar containerRef={containerRef}>
      {/* Sort field */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="cb-sort-trigger"
          panelId="cb-sort-panel"
          label={labelFor(sortOptions, sortField)}
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => toggleDropdown('sort')}
        />
        <DropdownPanelFrame
          id="cb-sort-panel"
          labelledBy="cb-sort-trigger"
          isOpen={openDropdownId === 'sort'}
        >
          <SingleSelectList
            options={sortOptions}
            selectedKey={sortField}
            onChange={key => {
              onSortFieldChange(key as CanBuildSortField);
              closeDropdown();
            }}
          />
        </DropdownPanelFrame>
      </div>

      {/* Order direction */}
      <div className="relative shrink-0">
        <DropdownTrigger
          id="cb-order-trigger"
          panelId="cb-order-panel"
          label={labelFor(orderOptions, sortDir)}
          labelIcon={<ArrowUpDown size={16} />}
          isOpen={openDropdownId === 'order'}
          onToggle={() => toggleDropdown('order')}
        />
        <DropdownPanelFrame
          id="cb-order-panel"
          labelledBy="cb-order-trigger"
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
    </ControlBar>
  );
}
