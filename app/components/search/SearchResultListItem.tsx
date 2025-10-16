'use client';

import Link from 'next/link';
import type { SearchResult } from './types';

export function SearchResultListItem({ result }: { result: SearchResult }) {
  return (
    <li className="hover:bg-neutral-100">
      <Link
        href={`/set/${encodeURIComponent(result.setNumber)}`}
        className="flex w-full items-center justify-between border border-neutral-200 bg-background"
      >
        <div className="flex w-full justify-center gap-2">
          <div className="flex h-48 w-48 items-center justify-center p-4">
            {result.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-xs text-foreground-muted">no img</div>
            )}
          </div>
          <div className="w-full truncate px-4">
            <div className="w-full text-sm">
              {result.setNumber} — {result.name}
            </div>
            <div className="w-full text-xs text-foreground-muted">
              {result.year} · {result.numParts} parts
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
