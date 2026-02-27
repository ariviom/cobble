'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { Spinner } from '@/app/components/ui/Spinner';
import { useGapClosers } from '@/app/hooks/useGapClosers';
import Image from 'next/image';
import Link from 'next/link';

type CanBuildDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  set: {
    setNum: string;
    name: string;
    year: number | null;
    imageUrl: string | null;
    numParts: number;
    themeName: string | null;
    coveragePct: number;
  } | null;
};

export function CanBuildDetailModal({
  isOpen,
  onClose,
  set,
}: CanBuildDetailModalProps) {
  const { data, isLoading, isError } = useGapClosers(
    isOpen && set ? set.setNum : null
  );

  if (!set) return null;

  const metaParts: string[] = [set.setNum];
  if (set.year != null) metaParts.push(String(set.year));
  if (set.themeName) metaParts.push(set.themeName);
  metaParts.push(`${set.numParts} parts`);

  const gapClosers = data?.gaps.slice(0, 3) ?? [];

  return (
    <Modal open={isOpen} title={set.name} onClose={onClose}>
      {/* Set image */}
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
        {set.imageUrl ? (
          <Image
            src={set.imageUrl}
            alt={set.name}
            fill
            className="object-contain p-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
          />
        ) : (
          <ImagePlaceholder variant="card" />
        )}
      </div>

      {/* Set details */}
      <div className="mt-3">
        <p className="text-sm font-semibold text-foreground-muted">
          {metaParts.join(' \u00B7 ')}
        </p>
      </div>

      {/* Coverage section */}
      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuenow={Math.round(set.coveragePct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(set.coveragePct)}% coverage`}
          className="h-3 w-full overflow-hidden rounded-full bg-background-muted"
        >
          <div
            className="h-full rounded-full bg-theme-primary transition-[width] duration-300"
            style={{ width: `${Math.round(set.coveragePct)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-foreground-muted">
          You have {Math.round(set.coveragePct)}% of the parts for this set
        </p>
      </div>

      {/* Gap Closer section */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-foreground">Close the Gap</h3>

        <div className="mt-3">
          {isLoading && <Spinner label="Finding gap closers..." />}

          {isError && (
            <p className="text-sm text-foreground-muted">
              Unable to load gap closers. Please try again later.
            </p>
          )}

          {!isLoading && !isError && gapClosers.length === 0 && (
            <p className="text-sm text-foreground-muted">
              No gap closers found for this set.
            </p>
          )}

          {!isLoading && !isError && gapClosers.length > 0 && (
            <div className="flex flex-col gap-2">
              {gapClosers.map(gc => (
                <Link
                  key={gc.setNum}
                  href={`/sets/${encodeURIComponent(gc.setNum)}`}
                  className="flex items-center justify-between rounded-lg border border-subtle p-3 transition-colors hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {gc.name}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {gc.numParts} parts
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    +{Math.round(gc.coverageGainPct)}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer link */}
      <div className="mt-6 border-t border-subtle pt-4">
        <Link
          href={`/sets/${encodeURIComponent(set.setNum)}`}
          className="text-sm font-semibold text-theme-primary hover:underline"
        >
          View full inventory
        </Link>
      </div>
    </Modal>
  );
}
