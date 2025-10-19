'use client';

import {
  DropdownSection,
  SingleSelectList,
} from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { InventoryFilter } from '../types';
import {
  getParentState,
  toggleParent,
  toggleSubcategory,
} from './categoryFilterHelpers';

type Props = {
  filter: InventoryFilter;
  onChangeFilter: (f: InventoryFilter) => void;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
  isDesktop: boolean;
  onMobileSelect?: () => void;
};

export function SidebarCategoryPanel({
  filter,
  onChangeFilter,
  parentOptions,
  subcategoriesByParent,
  isDesktop,
  onMobileSelect,
}: Props) {
  const [activeParent, setActiveParent] = useState<string | null>(null);

  function toggleParentCheckbox(parent: string) {
    onChangeFilter(toggleParent(filter, subcategoriesByParent, parent));
  }

  function toggleSubcategoryForActive(sub: string) {
    if (!activeParent) return;
    onChangeFilter(toggleSubcategory(filter, activeParent, sub));
  }

  // Mobile: simple single-select of parents; no checkboxes/carets
  if (!isDesktop) {
    return (
      <DropdownSection>
        <SingleSelectList
          options={[
            { key: '__all__', text: 'All Pieces' },
            ...parentOptions.map(p => ({ key: p, text: p })),
          ]}
          selectedKey={filter.parent ?? '__all__'}
          onChange={key => {
            if (key === '__all__') {
              onChangeFilter({ ...filter, parent: null, subcategories: [] });
            } else {
              onChangeFilter({ ...filter, parent: key, subcategories: [] });
            }
            onMobileSelect?.();
          }}
        />
      </DropdownSection>
    );
  }

  return activeParent === null ? (
    <DropdownSection>
      <div>
        {/* Parents */}
        {parentOptions.map(parent => {
          const state = getParentState(filter, subcategoriesByParent, parent);
          const selected = filter.parent === parent;
          const subCount = (subcategoriesByParent[parent] || []).length;
          return (
            <div
              key={parent}
              className="relative flex h-10 border-b border-foreground-accent"
            >
              <RowButton
                selected={selected}
                onClick={() => toggleParentCheckbox(parent)}
                wrapperClassName="flex-1"
              >
                <RowCheckbox
                  checked={state === 'all'}
                  indeterminate={state === 'some'}
                />
                <span>{parent}</span>
              </RowButton>
              {subCount > 1 && (
                <button
                  type="button"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center border-l border-foreground-accent text-foreground-muted hover:bg-neutral-100 hover:text-foreground"
                  onClick={e => {
                    e.stopPropagation();
                    setActiveParent(parent);
                  }}
                  aria-label={`Show ${parent} subcategories`}
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </DropdownSection>
  ) : (
    <>
      <DropdownSection>
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="rounded p-1 hover:bg-neutral-100"
            onClick={() => setActiveParent(null)}
            aria-label="Back to categories"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold">{activeParent}</span>
        </div>
      </DropdownSection>
      <DropdownSection>
        <div>
          {(subcategoriesByParent[activeParent] ?? []).map(sub => {
            const selected =
              filter.parent === activeParent &&
              (filter.subcategories || []).includes(sub);
            return (
              <RowButton
                key={sub}
                selected={selected}
                onClick={() => toggleSubcategoryForActive(sub)}
              >
                <RowCheckbox checked={selected} />
                <span>{sub}</span>
                <span className="ml-auto inline-flex h-full w-10 items-center justify-center text-foreground-muted">
                  <ChevronRight size={18} />
                </span>
              </RowButton>
            );
          })}
        </div>
      </DropdownSection>
    </>
  );
}
