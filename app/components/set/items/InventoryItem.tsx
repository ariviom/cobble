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
    <div className="flex w-full justify-between gap-6 rounded-lg border border-gray-200 p-4 grid:flex-col">
      <div
        className={`relative aspect-square grow-0 rounded-lg list:flex list:items-center list:justify-center grid:w-full list:item-sm:h-16 list:item-sm:w-16 list:item-md:h-24 list:item-md:w-24 list:item-lg:h-36 list:item-lg:w-36`}
      >
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            className={`h-full w-full overflow-hidden rounded-lg object-contain ${owned === row.quantityRequired ? 'ring-2 ring-brand-green' : ''}`}
          />
        ) : (
          <div className="text-xs text-gray-400">no img</div>
        )}
        <div
          className={`absolute right-0 bottom-0 h-6 w-6 translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border-2 border-brand-green bg-white text-brand-green ${owned === row.quantityRequired ? 'flex' : 'hidden'}`}
        >
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
        </div>
      </div>
      <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-center sm:justify-between grid:flex-col">
        <div className="h-full">
          <div className="w-full font-bold list:item-sm:text-sm list:item-lg:text-lg">
            {row.partName}
          </div>
          <div className="w-full text-gray-500 list:item-sm:text-xs list:item-md:text-sm">
            {isMinifig ? (
              hasRealFigId ? (
                <span>Minifigure ID: {displayId}</span>
              ) : null
            ) : (
              <span>
                {displayId} · {row.colorName}
              </span>
            )}
          </div>
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
