'use client';

import { DropdownSection } from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { InventoryFilter } from '../types';
import {
  clearParentSubcategories,
  getParentState,
  toggleParent,
  toggleSubcategory,
} from './categoryFilterHelpers';

type Props = {
  filter: InventoryFilter;
  onChangeFilter: (f: InventoryFilter) => void;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
  parentCounts?: Record<string, number>;
};

export function SidebarCategoryPanel({
  filter,
  onChangeFilter,
  parentOptions,
  subcategoriesByParent,
  parentCounts,
}: Props) {
  const [activeParent, setActiveParent] = useState<string | null>(null);

  function toggleParentCheckbox(parent: string) {
    onChangeFilter(toggleParent(filter, subcategoriesByParent, parent));
  }

  function toggleSubcategoryForActive(sub: string) {
    if (!activeParent) return;
    onChangeFilter(
      toggleSubcategory(filter, subcategoriesByParent, activeParent, sub)
    );
  }

  return activeParent === null ? (
    <DropdownSection>
      <div>
        {/* Parents */}
        {parentOptions.map(parent => {
          const state = getParentState(filter, subcategoriesByParent, parent);
          const selected = (filter.parents || []).includes(parent);
          const subCount = (subcategoriesByParent[parent] || []).length;
          return (
            <div
              key={parent}
              className="relative flex border-b border-foreground-accent"
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
                <span>
                  {parent}
                  {typeof parentCounts?.[parent] === 'number' ? (
                    <span className="ml-1 text-foreground-muted">
                      ({parentCounts![parent]})
                    </span>
                  ) : null}
                </span>
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
        {(filter.parents?.length || 0) > 0 ? (
          <div className="flex w-full justify-center border-b border-neutral-300">
            <button
              type="button"
              className="h-full w-full cursor-pointer py-4 hover:bg-neutral-100"
              onClick={() =>
                onChangeFilter({
                  ...filter,
                  parents: [],
                  subcategoriesByParent: {},
                })
              }
            >
              Clear All
            </button>
          </div>
        ) : null}
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
            const parentSelected = (filter.parents || []).includes(
              activeParent
            );
            const explicit = filter.subcategoriesByParent?.[activeParent];
            const isEffectivelySelected =
              parentSelected &&
              (!explicit || explicit.length === 0 || explicit.includes(sub));
            return (
              <RowButton
                key={sub}
                selected={isEffectivelySelected}
                onClick={() => toggleSubcategoryForActive(sub)}
              >
                <RowCheckbox checked={isEffectivelySelected} />
                <span>{sub}</span>
                <span className="ml-auto inline-flex h-full w-10 items-center justify-center text-foreground-muted">
                  <ChevronRight size={18} />
                </span>
              </RowButton>
            );
          })}
          <div className="flex w-full justify-center border-b border-neutral-300">
            <button
              type="button"
              className="h-full w-full cursor-pointer py-4 hover:bg-neutral-100"
              onClick={() => {
                if (!activeParent) return;
                onChangeFilter(clearParentSubcategories(filter, activeParent));
              }}
            >
              Clear All
            </button>
          </div>
        </div>
      </DropdownSection>
    </>
  );
}
