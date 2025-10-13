'use client';

import { cx } from '@/app/components/ui/utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useOwnedStore } from '@/app/store/owned';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';

type Props = {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
};

export function SetInfoButton({ setNumber, setName, imageUrl }: Props) {
  const [open, setOpen] = useState(false);
  const { isLoading, keys, required, totalRequired, totalMissing } =
    useInventory(setNumber);
  const ownedTotal = useMemo(
    () => totalRequired - totalMissing,
    [totalRequired, totalMissing]
  );
  const ownedStore = useOwnedStore();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cx(
          'flex items-center rounded-md border bg-white',
          'px-2 py-1',
          'hover:bg-gray-50',
          'min-h-10'
        )}
        aria-expanded={open}
        aria-controls="setinfo-panel"
      >
        {imageUrl ? (
          <div className="mr-2 flex-shrink-0">
            {/* aspect-square, fixed size, do not grow */}
            <div className="h-8 w-8 overflow-hidden rounded-sm border">
              <Image
                src={imageUrl}
                alt="Set thumbnail"
                width={32}
                height={32}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ) : (
          <div className="mr-2 h-8 w-8 flex-shrink-0 rounded-sm border bg-gray-100" />
        )}
        <div className="flex min-w-0 flex-col items-start text-left">
          <div className="max-w-[40vw] truncate text-sm font-medium sm:max-w-[50vw]">
            {setName}
          </div>
          <div className="text-xs text-gray-600">
            {isLoading
              ? 'Computing…'
              : `${ownedTotal} owned / ${totalMissing} missing`}
          </div>
        </div>
        <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-gray-600" />
      </button>
      {open && (
        <div
          id="setinfo-panel"
          className="absolute right-0 left-0 z-20 mt-2 rounded-md border bg-white p-3"
        >
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <div className="h-16 w-16 overflow-hidden rounded-sm border">
                <Image
                  src={imageUrl}
                  alt="Set thumbnail large"
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-sm border bg-gray-100" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="truncate text-sm font-semibold">{setName}</div>
              <div className="text-xs text-gray-600">
                {isLoading
                  ? 'Computing…'
                  : `${ownedTotal} owned / ${totalMissing} missing (of ${totalRequired})`}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => {
                ownedStore.markAllAsOwned(setNumber, keys, required);
                setOpen(false);
              }}
            >
              Mark all owned
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => {
                ownedStore.clearAll(setNumber);
                setOpen(false);
              }}
            >
              Mark none owned
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
