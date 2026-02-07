'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';

type Props = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
  ownedCount: number;
  totalParts: number;
};

export function SetProgressCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
  ownedCount,
  totalParts,
}: Props) {
  const pct = totalParts > 0 ? Math.round((ownedCount / totalParts) * 100) : 0;

  return (
    <SetDisplayCard
      setNumber={setNumber}
      name={name}
      year={year}
      imageUrl={imageUrl}
      numParts={numParts}
      themeId={themeId ?? null}
    >
      <div className="px-2 pb-2 sm:px-3 sm:pb-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-background-muted">
          <div
            className="h-full rounded-full bg-theme-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs font-semibold text-foreground-muted">
          {ownedCount} / {totalParts} pieces
        </p>
      </div>
    </SetDisplayCard>
  );
}
