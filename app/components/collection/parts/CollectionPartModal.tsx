'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { cn } from '@/app/components/ui/utils';
import { bulkUpsertLooseParts } from '@/app/lib/localDb/loosePartsStore';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CollectionPart } from './types';

type Props = {
  part: CollectionPart;
  onClose: () => void;
  onLooseQuantityChange: () => void;
};

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
  onClose,
  onLooseQuantityChange,
}: Props) {
  const [looseQty, setLooseQty] = useState(part.looseQuantity);

  // Keep local state in sync if part prop changes (e.g. after reload)
  useEffect(() => {
    setLooseQty(part.looseQuantity);
  }, [part.looseQuantity]);

  const handleLooseChange = async (next: number) => {
    setLooseQty(next);
    await bulkUpsertLooseParts(
      [{ partNum: part.partNum, colorId: part.colorId, quantity: next }],
      'replace'
    );
    onLooseQuantityChange();
  };

  const ownedFromSets = part.ownedFromSets;
  const totalOwned = ownedFromSets + looseQty;

  const bricklinkUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(part.partNum)}#T=S`;
  const rebrickableUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/${part.colorId}/`;
  const detailsHref = `/parts/${encodeURIComponent(part.partNum)}`;

  const showSetBreakdown = part.setSources.length > 1;

  return (
    <Modal open onClose={onClose} title={part.partName}>
      <div className="-mx-5 -my-5">
        {/* Hero image */}
        <div className="aspect-square w-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
          {part.imageUrl ? (
            <OptimizedImage
              src={part.imageUrl}
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
            {part.colorName ? ` · ${part.colorName}` : ''}
          </p>
        </div>

        {/* Quantity summary */}
        <div className="border-t-2 border-subtle px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Total owned: {totalOwned}
          </p>
          {(ownedFromSets > 0 || looseQty > 0) && (
            <p className="text-xs text-foreground-muted">
              {ownedFromSets > 0 && `${ownedFromSets} from sets`}
              {ownedFromSets > 0 && looseQty > 0 && ' + '}
              {looseQty > 0 && `${looseQty} loose`}
            </p>
          )}
        </div>

        {/* Per-set breakdown */}
        {showSetBreakdown && (
          <div className="border-t-2 border-subtle px-4 py-3">
            <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
              By set
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-foreground-muted">
                  <th className="pb-1 text-left font-medium">Set</th>
                  <th className="pb-1 text-right font-medium">Owned / Req.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {part.setSources.map(src => (
                  <tr key={src.setNumber}>
                    <td className="py-1 text-foreground">
                      <span className="font-medium">{src.setNumber}</span>
                      {src.setName && (
                        <span className="ml-1 text-foreground-muted">
                          {src.setName}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right text-foreground tabular-nums">
                      {src.quantityOwned} / {src.quantityInSet}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Loose quantity editor */}
        <div className="border-t-2 border-subtle px-4 py-3">
          <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
            Loose quantity
          </p>
          <LooseQuantityControl value={looseQty} onChange={handleLooseChange} />
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
