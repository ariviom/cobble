'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import {
  bulkUpsertLooseParts,
  getLoosePart,
} from '@/app/lib/localDb/loosePartsStore';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { groupColors } from './colorGroups';
import { ColorPicker } from './ColorPicker';
import { LooseQuantityControl } from './LooseQuantityControl';
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

  // Load loose quantity + owned-from-sets whenever the selected color changes.
  // Owned count comes from server (queries user_sets + rb_inventory_parts).
  // Loose count comes from IndexedDB.
  useEffect(() => {
    let cancelled = false;

    const loosePromise = getLoosePart(part.partNum, selectedColorId);
    const ownedPromise = fetch(
      `/api/parts/owned?partNum=${encodeURIComponent(part.partNum)}&colorId=${selectedColorId}`
    )
      .then(res => (res.ok ? res.json() : { total: 0, sets: [] }))
      .catch(() => ({ total: 0, sets: [] }));

    Promise.all([loosePromise, ownedPromise]).then(
      ([looseEntry, ownedData]) => {
        if (cancelled) return;
        setLooseQty(looseEntry?.quantity ?? 0);
        setOwnedFromSetsForColor(ownedData.total);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [part.partNum, selectedColorId]);

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

  const bricklinkUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(part.partNum)}#T=S`;
  const rebrickableUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/${selectedColorId}/`;
  const detailsHref = `/parts/${encodeURIComponent(part.partNum)}`;

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

        {/* Color picker */}
        {availableColors && availableColors.length > 0 && (
          <div className="border-t-2 border-subtle px-4 py-3">
            <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
              Color
            </p>
            <ColorPicker
              colorGroups={colorGroups}
              allColors={availableColors}
              selectedColorId={selectedColorId}
              expandedGroup={expandedGroup}
              onExpandGroup={setExpandedGroup}
              onSelectColor={setSelectedColorId}
            />
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
