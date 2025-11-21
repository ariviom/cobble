'use client';

import { SetStatusMenu } from '@/app/components/set/SetStatusMenu';
import Link from 'next/link';
import type { IdentifySet } from './types';

type Props = {
  item: IdentifySet;
  onRemove?: (setNumber: string) => void;
};

export function IdentifySetListItem({ item, onRemove }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white dark:bg-background">
      <Link
        href={`/sets/${encodeURIComponent(item.setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-neutral-50">
            <div className="relative mx-auto aspect-square w-full max-w-full bg-white p-2">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-xs text-foreground-muted">No Image</div>
              )}
            </div>
          </div>
          <div className="flex items-start justify-between gap-2 px-3 py-3">
            <div className="min-w-0">
              <div className="line-clamp-1 w-full overflow-hidden text-sm font-medium">
                {item.name}
              </div>
              <div className="mt-1 w-full text-xs text-foreground-muted">
                {item.setNumber} | {item.year} | qty in set: {item.quantity}
              </div>
            </div>
            <SetStatusMenu
              setNumber={item.setNumber}
              name={item.name}
              year={item.year}
              imageUrl={item.imageUrl}
              // Identify sets only expose total quantity in this context; pass as numParts surrogate.
              numParts={item.quantity}
              onRemove={
                onRemove
                  ? () => {
                      onRemove(item.setNumber);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </Link>
    </div>
  );
}
