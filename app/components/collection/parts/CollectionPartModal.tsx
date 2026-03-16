'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { cn } from '@/app/components/ui/utils';
import {
  bulkUpsertLooseParts,
  getLoosePart,
} from '@/app/lib/localDb/loosePartsStore';
import { getOwnedAcrossSets } from '@/app/lib/localDb/ownedStore';
import { useUserSetsStore } from '@/app/store/user-sets';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { groupColors } from './colorGroups';
import type { CollectionPart, CollectionPartSetSource } from './types';

type BaseProps = {
  onClose: () => void;
  onLooseQuantityChange: () => void;
  /** Whether to show the "Owned from sets" column (based on user syncFromSets setting). Defaults to true. */
  showOwnedFromSets?: boolean;
};

type LegacyProps = BaseProps & {
  part: CollectionPart;
  availableColors?: undefined;
};

type FlexibleProps = BaseProps & {
  part: {
    partNum: string;
    partName: string;
    imageUrl: string | null;
    colorId: number;
    colorName: string;
    ownedFromSets?: number;
    setSources?: CollectionPartSetSource[];
  };
  availableColors: Array<{
    colorId: number;
    colorName: string;
    rgb?: string | null;
    imageUrl: string | null;
  }>;
};

type Props = LegacyProps | FlexibleProps;

const MAX_LOOSE = 99999;

function LooseQuantityControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [inputValue, setInputValue] = useState<string>(() => String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value));
    }
  }, [value, isFocused]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === '') {
      setInputValue('');
      return;
    }
    if (!/^\d+$/.test(raw)) return;

    setInputValue(raw);
    const parsed = Number.parseInt(raw, 10);
    onChange(Math.min(parsed, MAX_LOOSE));
  };

  const handleBlur = () => {
    const parsed =
      inputValue === '' || !/^\d+$/.test(inputValue)
        ? 0
        : Number.parseInt(inputValue, 10);
    const clamped = Math.max(0, Math.min(parsed, MAX_LOOSE));
    if (clamped !== value) onChange(clamped);
    setInputValue(String(clamped));
    setIsFocused(false);
  };

  return (
    <div className="flex h-12 w-full items-center rounded-md border border-subtle">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label="Decrease loose quantity"
        className={cn(
          'flex size-12 shrink-0 items-center justify-center text-2xl font-bold',
          'text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted'
        )}
      >
        –
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Loose quantity"
        className="hide-arrows h-full w-full border-x border-subtle text-center text-sm font-medium"
        value={inputValue}
        onFocus={e => {
          setIsFocused(true);
          e.target.select();
        }}
        onChange={handleInputChange}
        onBlur={handleBlur}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(value + 1, MAX_LOOSE))}
        disabled={value >= MAX_LOOSE}
        aria-label="Increase loose quantity"
        className={cn(
          'flex size-12 shrink-0 items-center justify-center text-2xl font-bold',
          'text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted'
        )}
      >
        +
      </button>
    </div>
  );
}

export function CollectionPartModal({
  part,
  availableColors,
  onClose,
  onLooseQuantityChange,
  showOwnedFromSets = true,
}: Props) {
  const [selectedColorId, setSelectedColorId] = useState(part.colorId);
  const [looseQty, setLooseQty] = useState(0);
  const [ownedFromSetsForColor, setOwnedFromSetsForColor] = useState(0);
  const [setSourcesForColor, setSetSourcesForColor] = useState<
    Array<{ setNumber: string; quantity: number }>
  >([]);

  // Get the list of set numbers the user has marked as "owned".
  // Select the stable sets object, then derive the list in useMemo to avoid
  // creating a new array reference on every render (which causes infinite loops).
  const userSets = useUserSetsStore(state => state.sets);
  const ownedSetNumbers = useMemo(() => {
    const nums: string[] = [];
    for (const entry of Object.values(userSets)) {
      if (entry.status.owned) nums.push(entry.setNumber);
    }
    return nums;
  }, [userSets]);

  // Load loose quantity + owned-from-sets whenever the selected color changes.
  // "Owned from sets" = sum of quantityRequired from cached set inventories
  // for sets the user has marked as owned.
  useEffect(() => {
    let cancelled = false;
    const inventoryKey = `${part.partNum}:${selectedColorId}`;

    Promise.all([
      getLoosePart(part.partNum, selectedColorId),
      getOwnedAcrossSets(inventoryKey, ownedSetNumbers),
    ]).then(([looseEntry, ownedData]) => {
      if (cancelled) return;
      setLooseQty(looseEntry?.quantity ?? 0);
      setOwnedFromSetsForColor(ownedData.total);
      setSetSourcesForColor(ownedData.sets);
    });

    return () => {
      cancelled = true;
    };
  }, [part.partNum, selectedColorId, ownedSetNumbers]);

  const handleLooseChange = async (next: number) => {
    setLooseQty(next);
    await bulkUpsertLooseParts(
      [{ partNum: part.partNum, colorId: selectedColorId, quantity: next }],
      'replace'
    );
    onLooseQuantityChange();
  };

  // Fetch per-color image on demand when color changes and no imageUrl is cached.
  // Keep the previous image visible until the new one is ready (no flash).
  const [colorImageUrl, setColorImageUrl] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const colorGroups = useMemo(
    () => (availableColors ? groupColors(availableColors) : []),
    [availableColors]
  );

  // Auto-expand gray group first (most common starting point)
  useEffect(() => {
    if (!colorGroups.length) return;
    const gray = colorGroups.find(g => g.key === 'gray');
    setExpandedGroup(gray ? 'gray' : colorGroups[0]!.key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!availableColors) return;
    const color = availableColors.find(c => c.colorId === selectedColorId);
    if (color?.imageUrl) {
      setColorImageUrl(color.imageUrl);
      return;
    }
    // Fetch from API — keep previous image visible until new one is ready
    let cancelled = false;
    fetch(
      `/api/search/parts/image?partNum=${encodeURIComponent(part.partNum)}&colorId=${selectedColorId}`
    )
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data?.imageUrl) {
          // Preload the image before swapping to avoid flash
          const img = new Image();
          img.onload = () => {
            if (!cancelled) setColorImageUrl(data.imageUrl);
          };
          img.src = data.imageUrl;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [part.partNum, selectedColorId, availableColors]);

  const currentColor = availableColors?.find(
    c => c.colorId === selectedColorId
  );
  const displayColorName = currentColor?.colorName ?? part.colorName;
  const displayImageUrl =
    colorImageUrl ?? currentColor?.imageUrl ?? part.imageUrl;

  const ownedFromSets = ownedFromSetsForColor;
  const totalOwned = ownedFromSets + looseQty;

  const bricklinkUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(part.partNum)}#T=S`;
  const rebrickableUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/${selectedColorId}/`;
  const detailsHref = `/parts/${encodeURIComponent(part.partNum)}`;

  const showSetBreakdown = setSourcesForColor.length > 1;

  return (
    <Modal open onClose={onClose} title={part.partName}>
      <div className="-mx-5 -my-5">
        {/* Hero image */}
        <div className="aspect-square w-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
          {displayImageUrl ? (
            <OptimizedImage
              src={displayImageUrl}
              alt={part.partName}
              variant="inventoryModal"
              className="size-full object-contain p-6 drop-shadow-sm"
            />
          ) : (
            <ImagePlaceholder variant="fill" />
          )}
        </div>

        {/* Identity bar */}
        <div className="border-t-2 border-subtle px-4 py-2.5">
          <p className="text-xs text-foreground-muted">
            Part {part.partNum}
            {displayColorName ? ` · ${displayColorName}` : ''}
          </p>
        </div>

        {/* Color picker — grouped */}
        {colorGroups.length > 0 && (
          <div className="border-t-2 border-subtle px-4 py-3">
            <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
              Color
            </p>
            {/* Group toggles */}
            <div className="flex flex-wrap gap-2">
              {colorGroups.map(g => {
                const isExpanded = expandedGroup === g.key;
                const hasSelected = g.colors.some(
                  c => c.colorId === selectedColorId
                );
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setExpandedGroup(isExpanded ? null : g.key)}
                    className={cn(
                      'relative flex size-9 items-center justify-center overflow-hidden rounded-full border-2 transition-colors',
                      isExpanded
                        ? 'border-theme-primary ring-2 ring-theme-primary/30'
                        : hasSelected
                          ? 'border-strong'
                          : 'border-subtle hover:border-strong'
                    )}
                    title={`${g.label} (${g.colors.length})`}
                  >
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: `#${g.swatch}` }}
                    />
                    <span
                      className={cn(
                        'relative text-2xs font-bold',
                        g.swatch === 'FFFFFF' || g.swatch === 'F2CD37'
                          ? 'text-neutral-500'
                          : 'text-white'
                      )}
                    >
                      {g.colors.length}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Expanded group colors */}
            {expandedGroup && (
              <>
                <div className="my-2.5 border-t border-subtle" />
                <div className="flex flex-wrap gap-2">
                  {colorGroups
                    .find(g => g.key === expandedGroup)
                    ?.colors.map(c => (
                      <button
                        key={c.colorId}
                        type="button"
                        onClick={() => setSelectedColorId(c.colorId)}
                        className={cn(
                          'size-9 overflow-hidden rounded-full border-2 transition-colors',
                          c.colorId === selectedColorId
                            ? 'border-theme-primary ring-2 ring-theme-primary/30'
                            : 'border-subtle hover:border-strong'
                        )}
                        title={c.colorName}
                      >
                        {c.imageUrl ? (
                          <img
                            src={c.imageUrl}
                            alt={c.colorName}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div
                            className="size-full"
                            style={{
                              backgroundColor: c.rgb ? `#${c.rgb}` : '#ccc',
                            }}
                          />
                        )}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Owned / Loose summary side by side */}
        <div className="flex gap-px border-t-2 border-subtle bg-subtle">
          {showOwnedFromSets && (
            <div className="flex-1 bg-card px-4 py-3">
              <p className="mb-1 text-xs font-medium text-foreground-muted uppercase">
                Owned
              </p>
              <p className="text-2xl font-bold tabular-nums">{ownedFromSets}</p>
              {showSetBreakdown && (
                <div className="mt-2 space-y-0.5">
                  {setSourcesForColor.map(src => (
                    <div
                      key={src.setNumber}
                      className="flex justify-between text-2xs text-foreground-muted"
                    >
                      <span>{src.setNumber}</span>
                      <span className="tabular-nums">{src.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex-1 bg-card px-4 py-3">
            <p className="mb-1 text-xs font-medium text-foreground-muted uppercase">
              Loose
            </p>
            <p className="text-2xl font-bold tabular-nums">{looseQty}</p>
          </div>
        </div>

        {/* Loose quantity editor — full width */}
        <div className="border-t-2 border-subtle px-4 py-3">
          <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
            Loose quantity
          </p>
          <LooseQuantityControl
            key={selectedColorId}
            value={looseQty}
            onChange={handleLooseChange}
          />
        </div>

        {/* Total */}
        {(ownedFromSets > 0 || looseQty > 0) && (
          <div className="border-t-2 border-subtle px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">
              Total: {totalOwned}
            </p>
          </div>
        )}

        {/* External links */}
        <div className="flex gap-px border-t-2 border-subtle bg-subtle">
          <a
            href={bricklinkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            BrickLink
            <ExternalLink className="size-3.5" />
          </a>
          <a
            href={rebrickableUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            Rebrickable
            <ExternalLink className="size-3.5" />
          </a>
          <Link
            href={detailsHref}
            onClick={e => e.stopPropagation()}
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-theme-text transition-colors hover:bg-card-muted"
          >
            View Details →
          </Link>
        </div>
      </div>
    </Modal>
  );
}
