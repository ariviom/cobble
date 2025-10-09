'use client';

import type { InventoryRow } from '../types';
import { OwnedQuantityControl } from './OwnedQuantityControl';

type Props = {
  row: InventoryRow;
  owned: number;
  missing: number;
  onOwnedChange: (next: number) => void;
  showGroupHeader?: boolean;
  category?: string;
};

export function InventoryItem({
  row,
  owned,
  onOwnedChange,
  showGroupHeader,
  category,
}: Props) {
  return (
    <>
      {showGroupHeader && (
        <div className="w-full py-1 text-xs font-semibold text-gray-600">
          {category}
        </div>
      )}

      <div className="flex w-full items-center justify-between p-4 px-2 list:odd:bg-gray-100 grid:flex-col grid:border grid:border-gray-200">
        <div className="flex w-full justify-center gap-2 grid:flex-col grid:items-center">
          <div className="list:flex list:items-center list:justify-center grid:h-40 grid:w-full list:item-sm:w-12 list:item-md:w-28 list:item-lg:w-44">
            {row.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.imageUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-xs text-gray-400">no img</div>
            )}
          </div>
          <div className="w-full truncate grid:text-sm">
            <div className="w-full text-sm">{row.partName}</div>
            <div className="w-full text-xs text-gray-500">
              {row.partId} · {row.colorName}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <OwnedQuantityControl
            required={row.quantityRequired}
            owned={owned}
            onChange={onOwnedChange}
          />
        </div>
      </div>
    </>
  );
}
