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
    onChangeFilter(toggleParent(filter, parent));
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
                  className="flex h-14 w-14 cursor-pointer items-center justify-center border-l border-foreground-accent text-foreground-muted hover:bg-card-muted hover:text-foreground"
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
          <div className="flex w-full justify-center border-b-2 border-subtle">
            <button
              type="button"
              className="h-full w-full cursor-pointer py-3.5 font-semibold text-foreground-muted transition-colors hover:bg-theme-primary/10 hover:text-foreground"
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
        <div className="flex items-center gap-2 border-b-2 border-subtle bg-background-muted/50 px-4 py-3">
          <button
            type="button"
            className="rounded-sm p-1.5 transition-colors hover:bg-theme-primary/20"
            onClick={() => setActiveParent(null)}
            aria-label="Back to categories"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-bold">{activeParent}</span>
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
          <div className="flex w-full justify-center border-b-2 border-subtle">
            <button
              type="button"
              className="h-full w-full cursor-pointer py-3.5 font-semibold text-foreground-muted transition-colors hover:bg-theme-primary/10 hover:text-foreground"
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
