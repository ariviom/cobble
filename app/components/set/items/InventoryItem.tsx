'use client';

import type { InventoryRow } from '../types';
import { OwnedQuantityControl } from './OwnedQuantityControl';

type Props = {
  row: InventoryRow;
  owned: number;
  missing: number;
  onOwnedChange: (next: number) => void;
};

export function InventoryItem({ row, owned, onOwnedChange }: Props) {
  const isMinifig = row.parentCategory === 'Minifigure';
  const isFigId =
    typeof row.partId === 'string' && row.partId.startsWith('fig:');
  const displayId = isFigId ? row.partId.replace(/^fig:/, '') : row.partId;
  const hasRealFigId =
    isFigId &&
    typeof displayId === 'string' &&
    !displayId.startsWith('unknown-');
  return (
    <div className="flex w-full justify-start gap-6 rounded-lg border border-neutral-200 bg-white p-4 dark:bg-background grid:flex-col">
      <div
        className={`relative aspect-square grow-0 rounded-lg list:flex list:items-center list:justify-center grid:w-full list:item-sm:h-16 list:item-sm:w-16 list:item-md:h-24 list:item-md:w-24 list:item-lg:h-36 list:item-lg:w-36`}
      >
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            className={`h-full w-full overflow-hidden rounded-lg object-contain ${owned === row.quantityRequired ? 'ring-2 ring-brand-green' : ''}`}
            data-knockout="true"
          />
        ) : (
          <div className="text-xs text-foreground-muted">no img</div>
        )}
        <div
          className={`absolute right-0 bottom-0 flex h-8 min-w-8 translate-x-3 translate-y-1/2 items-center justify-center rounded-full ${owned === row.quantityRequired ? 'border-2 border-brand-green bg-background text-brand-green' : ''}`}
        >
          {owned === row.quantityRequired ? (
            <svg
              x="0"
              y="0"
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12.5 4L5.5 11L2.5 8"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <span className="hidden border-brand-red bg-background px-2 text-sm text-brand-red">
              Need {row.quantityRequired - owned}
            </span>
          )}
        </div>
      </div>
      <div className="flex h-full w-full flex-col gap-6 sm:flex-row sm:items-center sm:justify-between grid:flex-col">
        <div className="h-full">
          <p className="line-clamp-2 w-full overflow-hidden font-bold">
            {row.partName}
          </p>
          <p className="w-full text-foreground-muted list:item-sm:text-xs list:item-md:text-sm">
            {isMinifig ? (
              hasRealFigId ? (
                <span>Minifigure ID: {displayId}</span>
              ) : null
            ) : (
              <span className="text-sm">
                {displayId} | {row.colorName}
              </span>
            )}
          </p>
        </div>
        <OwnedQuantityControl
          required={row.quantityRequired}
          owned={owned}
          onChange={onOwnedChange}
        />
      </div>
    </div>
  );
}
