'use client';
import Link from 'next/link';
import type { IdentifySet } from './types';

export function IdentifySetListItem({ item }: { item: IdentifySet }) {
  return (
    <div className="group overflow-hidden rounded-lg border border-neutral-200 bg-white dark:bg-background">
      <Link
        href={`/set/${encodeURIComponent(item.setNumber)}`}
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
                <div className="text-xs text-foreground-muted">no img</div>
              )}
            </div>
          </div>
          <div className="px-3 py-3">
            <div className="line-clamp-1 w-full overflow-hidden text-sm font-medium">
              {item.name}
            </div>
            <div className="mt-1 w-full text-xs text-foreground-muted">
              {item.setNumber} | {item.year} | qty in set: {item.quantity}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
