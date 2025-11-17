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
        className={`relative grow-0 justify-center rounded-lg list:flex list:items-center grid:w-full list:item-sm:h-16 list:item-sm:w-16 list:item-md:h-24 list:item-md:w-24 list:item-lg:h-36 list:item-lg:w-36`}
      >
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            className={`mx-auto h-full w-full overflow-hidden rounded-lg object-contain grid:item-sm:max-w-24 ${owned === row.quantityRequired ? 'ring-2 ring-brand-green' : ''}`}
            data-knockout="true"
          />
        ) : (
          <div className="text-xs text-foreground-muted">no img</div>
        )}
        <div
          className={`absolute right-0 bottom-0 flex h-6 min-w-6 translate-x-3 translate-y-1/2 items-center justify-center rounded-full grid:h-8 grid:min-w-8 ${owned === row.quantityRequired ? 'border-2 border-brand-green bg-background text-brand-green' : ''}`}
        >
          {owned === row.quantityRequired ? (
            <svg
              x="0"
              y="0"
              width="16"
              height="16"
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
      <div className="flex h-full w-full flex-col justify-between gap-x-6 gap-y-3 sm:flex-row sm:items-center grid:flex-col">
        <div className="h-full">
          <p className="line-clamp-1 w-full overflow-hidden font-medium lg:line-clamp-2">
            {row.partName}
          </p>
          <p className="mt-1 w-full text-sm text-neutral-400">
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
        <div className="w-full sm:list:w-auto">
          <div className="mt-3 mb-2 flex w-full justify-between gap-4 font-medium list:sm:w-36">
            <p className="text-foreground-muted">
              {owned}/{row.quantityRequired}
            </p>
            <p
              className={
                row.quantityRequired === owned
                  ? 'text-brand-green'
                  : 'text-brand-red'
              }
            >
              {row.quantityRequired === owned
                ? 'Complete'
                : `Need ${row.quantityRequired - owned}`}
            </p>
          </div>
          <OwnedQuantityControl
            required={row.quantityRequired}
            owned={owned}
            onChange={onOwnedChange}
          />
        </div>
      </div>
    </div>
  );
}
