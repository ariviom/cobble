'use client';

import { ClearAllButton } from '@/app/components/ui/ClearAllButton';
import {
  clearParentSubcategories,
  getParentState,
  toggleParent,
  toggleSubcategory,
} from '@/app/components/ui/categoryFilterHelpers';
import { DropdownSection } from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { PartsFilter } from './types';

type Props = {
  filter: PartsFilter;
  onFilterChange: (f: PartsFilter) => void;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
};

export function CollectionCategoryPanel({
  filter,
  onFilterChange,
  parentOptions,
  subcategoriesByParent,
}: Props) {
  const [activeParent, setActiveParent] = useState<string | null>(null);

  if (activeParent !== null) {
    const subs = subcategoriesByParent[activeParent] ?? [];
    const parentSelected = (filter.parents || []).includes(activeParent);
    const explicit = filter.subcategoriesByParent?.[activeParent];

    return (
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
            {subs.map(sub => {
              const isEffectivelySelected =
                parentSelected &&
                (!explicit || explicit.length === 0 || explicit.includes(sub));
              return (
                <RowButton
                  key={sub}
                  selected={isEffectivelySelected}
                  onClick={() =>
                    onFilterChange(
                      toggleSubcategory(
                        filter,
                        subcategoriesByParent,
                        activeParent,
                        sub
                      )
                    )
                  }
                  className="border-b border-foreground-accent"
                >
                  <RowCheckbox checked={isEffectivelySelected} />
                  <span>{sub}</span>
                </RowButton>
              );
            })}
            <ClearAllButton
              onClick={() =>
                onFilterChange(clearParentSubcategories(filter, activeParent))
              }
            />
          </div>
        </DropdownSection>
      </>
    );
  }

  return (
    <DropdownSection>
      <div>
        {parentOptions.map(parent => {
          const state = getParentState(filter, subcategoriesByParent, parent);
          const selected = (filter.parents || []).includes(parent);
          const subCount = (subcategoriesByParent[parent] || []).length;
          return (
            <div
              key={parent}
              className="relative flex h-13 border-b border-foreground-accent"
            >
              <RowButton
                selected={selected}
                onClick={() => onFilterChange(toggleParent(filter, parent))}
                className="flex-1"
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
        {(filter.parents?.length || 0) > 0 && (
          <ClearAllButton
            onClick={() =>
              onFilterChange({
                ...filter,
                parents: [],
                subcategoriesByParent: {},
              })
            }
          />
        )}
      </div>
    </DropdownSection>
  );
}
