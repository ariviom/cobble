'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { SearchResult } from './types';

export function SearchResultListItem({ result }: { result: SearchResult }) {
  return (
    <div className="group overflow-hidden rounded-lg border border-neutral-200 bg-white dark:bg-background">
      <Link
        href={`/set/${encodeURIComponent(result.setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-neutral-50">
            <div className="relative mx-auto aspect-square w-full max-w-full bg-white p-2">
              {result.imageUrl ? (
                <Image
                  src={result.imageUrl}
                  alt=""
                  width={100}
                  height={100}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="text-xs text-foreground-muted">no img</div>
              )}
            </div>
          </div>
          <div className="px-3 py-3">
            <div className="line-clamp-1 w-full overflow-hidden text-sm font-medium">
              {result.name}
            </div>
            <div className="mt-1 w-full text-xs text-foreground-muted">
              {result.setNumber} | {result.year} | {result.numParts} parts
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
