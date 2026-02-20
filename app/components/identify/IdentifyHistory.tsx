'use client';

import { useEffect, useState } from 'react';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import {
  clearRecentIdentifies,
  getRecentIdentifies,
  type IdentifySource,
  type RecentIdentifyEntry,
} from '@/app/store/recent-identifies';

type Props = {
  onSelectPart: (partNum: string) => void;
  source?: IdentifySource;
};

export function IdentifyHistory({ onSelectPart, source }: Props) {
  const [entries, setEntries] = useState<RecentIdentifyEntry[]>([]);

  useEffect(() => {
    setEntries(getRecentIdentifies(source));
  }, [source]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
          Recent
        </span>
        {entries.length > 0 && (
          <button
            type="button"
            className="text-xs text-foreground-muted/60 transition-colors hover:text-foreground"
            onClick={() => {
              clearRecentIdentifies();
              setEntries([]);
            }}
          >
            Clear history
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          {source === 'text'
            ? 'No recent text searches. Enter a part or minifig ID above.'
            : source === 'camera'
              ? 'No recent photo identifications. Upload a photo to find sets.'
              : 'No recent identifications. Search with a photo to find sets.'}
        </p>
      ) : (
        <div className="-mx-6 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 px-6 py-1">
            {entries.map(entry => (
              <button
                key={entry.partNum}
                type="button"
                className="group flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:outline-none"
                onClick={() => onSelectPart(entry.partNum)}
                title={entry.name}
              >
                <div className="h-28 w-28 overflow-hidden rounded-md border border-subtle bg-background transition-colors group-hover:border-foreground-muted group-hover:shadow-sm">
                  {entry.imageUrl ? (
                    <OptimizedImage
                      src={entry.imageUrl}
                      alt={entry.name}
                      variant="recentIdentifyThumb"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ImagePlaceholder variant="thumbnail" />
                  )}
                </div>
                <span className="w-full truncate text-center text-xs text-foreground-muted">
                  {entry.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
