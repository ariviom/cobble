'use client';

import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { cn } from '@/app/components/ui/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CollectionPartCard } from './CollectionPartCard';
import { getGridClassName } from './gridClassName';
import { groupParts } from './sorting';
import type { CollectionPart } from './types';

type Props = {
  setNumber: string;
  setName: string;
  missingParts: CollectionPart[];
  isSelected: (key: string, setNumber: string) => boolean;
  onToggleSelection: (key: string, qty: number, setNumber: string) => void;
  onSelectAll: (
    items: Array<{ canonicalKey: string; quantity: number; setNumber: string }>
  ) => void;
  onDeselectAll: (keys: string[]) => void;
  onShowModal: (part: CollectionPart) => void;
  view: 'list' | 'grid' | 'micro';
  itemSize: 'sm' | 'md' | 'lg';
  groupBy: 'none' | 'color' | 'category';
  isCheckboxDisabled: boolean;
  onCheckboxDisabledClick?: () => void;
};

function getSetImageUrl(setNumber: string): string {
  return `https://cdn.rebrickable.com/media/sets/${setNumber}.jpg`;
}

export function MissingPartsSetGroup({
  setNumber,
  setName,
  missingParts,
  isSelected,
  onToggleSelection,
  onSelectAll,
  onDeselectAll,
  onShowModal,
  view,
  itemSize,
  groupBy,
  isCheckboxDisabled,
  onCheckboxDisabledClick,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const triStateRef = useRef<HTMLInputElement>(null);

  // Compute tri-state selection
  const selectedCount = missingParts.filter(p =>
    isSelected(p.canonicalKey, setNumber)
  ).length;
  const allSelected =
    selectedCount === missingParts.length && missingParts.length > 0;
  const someSelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (triStateRef.current) {
      triStateRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleTriStateChange = () => {
    if (isCheckboxDisabled) {
      onCheckboxDisabledClick?.();
      return;
    }
    if (allSelected || someSelected) {
      // Deselect all
      const keys = missingParts.map(p => `${p.canonicalKey}:${setNumber}`);
      onDeselectAll(keys);
    } else {
      // Select all
      const items = missingParts.map(p => {
        const missing =
          p.missingFromSets.find(m => m.setNumber === setNumber)
            ?.quantityMissing ?? 1;
        return { canonicalKey: p.canonicalKey, quantity: missing, setNumber };
      });
      onSelectAll(items);
    }
  };

  const missingCount = missingParts.reduce((sum, p) => {
    const entry = p.missingFromSets.find(m => m.setNumber === setNumber);
    return sum + (entry?.quantityMissing ?? 0);
  }, 0);

  const gridClassName = getGridClassName(view, itemSize);

  function renderCard(part: CollectionPart) {
    const entry = part.missingFromSets.find(m => m.setNumber === setNumber);
    return (
      <CollectionPartCard
        key={`${part.canonicalKey}:${setNumber}`}
        part={part}
        onShowModal={onShowModal}
        isSelected={isSelected(part.canonicalKey, setNumber)}
        onToggleSelection={() => {
          const qty = entry?.quantityMissing ?? 1;
          onToggleSelection(part.canonicalKey, qty, setNumber);
        }}
        isCheckboxDisabled={isCheckboxDisabled}
        {...(onCheckboxDisabledClick !== undefined && {
          onCheckboxDisabledClick,
        })}
        view={view}
        itemSize={itemSize}
      />
    );
  }

  function renderParts() {
    const grouped = groupParts(missingParts, groupBy);
    if (grouped) {
      return (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([groupLabel, groupItems]) => (
            <div key={groupLabel} className="flex flex-col gap-2">
              <div className="px-1 py-2 text-lg font-semibold tracking-wide text-foreground uppercase">
                {groupLabel}
              </div>
              <div
                data-view={view}
                data-item-size={itemSize}
                className={gridClassName}
              >
                {groupItems.map(renderCard)}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div data-view={view} data-item-size={itemSize} className={gridClassName}>
        {missingParts.map(renderCard)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Set header */}
      <div className="flex items-center gap-3 rounded-lg border border-subtle bg-card px-3 py-2">
        {/* Set thumbnail with checkbox overlay */}
        <div className="relative size-14 shrink-0 overflow-hidden rounded-sm ring-1 ring-foreground-accent">
          <OptimizedImage
            src={getSetImageUrl(setNumber)}
            alt={setName}
            variant="exclusiveSetThumb"
            className="h-full w-full object-contain"
          />
          <input
            ref={triStateRef}
            type="checkbox"
            className={cn(
              'absolute top-1 left-1 h-4 w-4 cursor-pointer rounded accent-theme-primary',
              isCheckboxDisabled && 'cursor-not-allowed opacity-40'
            )}
            checked={allSelected}
            onChange={handleTriStateChange}
            aria-label={`Select all missing parts for ${setName}`}
          />
        </div>

        {/* Set name/number */}
        <div className="min-w-0 flex-1">
          <p className="truncate leading-tight font-medium">{setName}</p>
          <p className="text-xs text-foreground-muted">{setNumber}</p>
        </div>

        {/* Missing count badge */}
        <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
          {missingCount} missing
        </span>

        {/* Expand/collapse chevron */}
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="shrink-0 rounded p-0.5 text-foreground-muted hover:text-foreground"
          aria-label={expanded ? 'Collapse section' : 'Expand section'}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Parts grid */}
      {expanded && renderParts()}
    </div>
  );
}
