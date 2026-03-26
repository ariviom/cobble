'use client';

import { SetDetailModal } from '@/app/components/set/SetDetailModal';
import { Badge } from '@/app/components/ui/Badge';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import MobileButtonHitArea from '@/app/components/ui/MobileButtonHitArea';
import { cn } from '@/app/components/ui/utils';
import { useUserSetsStore } from '@/app/store/user-sets';
import {
  ChevronDown,
  ChevronUp,
  Square,
  SquareCheck,
  SquareMinus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
  const [setModalOpen, setSetModalOpen] = useState(false);

  const userSet = useUserSetsStore(
    state => state.sets[setNumber.toLowerCase()]
  );
  const metaSegments: string[] = [setNumber];
  if (userSet?.year) metaSegments.push(String(userSet.year));
  if (userSet?.numParts) metaSegments.push(`${userSet.numParts} pieces`);

  // Compute tri-state selection
  const selectedCount = useMemo(
    () =>
      missingParts.filter(p => isSelected(p.canonicalKey, setNumber)).length,
    [missingParts, isSelected, setNumber]
  );
  const allSelected =
    selectedCount === missingParts.length && missingParts.length > 0;
  const someSelected = selectedCount > 0 && !allSelected;

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

  const missingCount = useMemo(
    () =>
      missingParts.reduce((sum, p) => {
        const entry = p.missingFromSets.find(m => m.setNumber === setNumber);
        return sum + (entry?.quantityMissing ?? 0);
      }, 0),
    [missingParts, setNumber]
  );

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
        needQuantity={entry?.quantityMissing}
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
    <div className="overflow-hidden rounded-lg border border-subtle bg-card">
      {/* Set header */}
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Leading-edge checkbox */}
        <button
          type="button"
          aria-label={
            allSelected
              ? `Deselect all missing parts for ${setName}`
              : `Select all missing parts for ${setName}`
          }
          aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
          role="checkbox"
          className={cn(
            'relative mt-1 flex shrink-0 items-center justify-center rounded-sm',
            isCheckboxDisabled
              ? 'cursor-not-allowed opacity-40'
              : 'cursor-pointer'
          )}
          onClick={handleTriStateChange}
          tabIndex={0}
        >
          <MobileButtonHitArea />
          {allSelected ? (
            <SquareCheck className="size-8 text-theme-text pointer-fine:size-6" />
          ) : someSelected ? (
            <SquareMinus className="size-8 text-theme-text pointer-fine:size-6" />
          ) : (
            <Square className="size-8 text-foreground-muted pointer-fine:size-6" />
          )}
        </button>

        {/* Set thumbnail — opens set detail modal */}
        <button
          type="button"
          aria-label={`View details for ${setName}`}
          className="size-20 shrink-0 cursor-pointer overflow-hidden rounded-sm ring-1 ring-foreground-accent transition-shadow hover:ring-2 hover:ring-theme-text"
          onClick={() => setSetModalOpen(true)}
        >
          <OptimizedImage
            src={getSetImageUrl(setNumber)}
            alt={setName}
            variant="exclusiveSetThumb"
            className="h-full w-full object-contain"
          />
        </button>

        {/* Set name + metadata */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold lg:text-xl">{setName}</p>
          <p className="mt-0.5 text-xs text-foreground-muted lg:text-sm">
            {metaSegments.join(' | ')}
          </p>
          <Badge
            variant="error"
            size="xs"
            className="mt-2 bg-danger/10 text-danger"
          >
            {missingCount} missing
          </Badge>
        </div>

        {/* Expand/collapse toggle */}
        <button
          type="button"
          aria-label={expanded ? 'Collapse parts' : 'Expand parts'}
          aria-expanded={expanded}
          className="mt-1 shrink-0 cursor-pointer rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-card-muted hover:text-foreground"
          onClick={() => setExpanded(prev => !prev)}
        >
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Parts grid */}
      {expanded && (
        <div className="border-t border-subtle bg-card-muted p-3">
          {renderParts()}
        </div>
      )}

      {/* Set detail modal — conditional to avoid idle hook instances */}
      {setModalOpen && (
        <SetDetailModal
          open
          onClose={() => setSetModalOpen(false)}
          setNumber={setNumber}
          setName={setName}
          imageUrl={getSetImageUrl(setNumber)}
        />
      )}
    </div>
  );
}
