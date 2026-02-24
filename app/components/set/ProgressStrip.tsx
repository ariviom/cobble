'use client';

import { useOptionalInventoryData } from '@/app/components/set/InventoryProvider';
import { getSlotColor } from '@/app/components/ui/ColorSlotPicker';
import { cn } from '@/app/components/ui/utils';

type Participant = {
  id: string;
  displayName: string;
  piecesFound: number;
  colorSlot?: number | null;
};

type ProgressStripProps = {
  numParts: number;
  searchPartyActive?: boolean;
  participants?: Participant[];
  currentParticipantId?: string | null;
  hiddenParticipantIds?: Set<string>;
};

export function ProgressStrip({
  numParts,
  searchPartyActive,
  participants = [],
  currentParticipantId,
  hiddenParticipantIds,
}: ProgressStripProps) {
  const inventoryData = useOptionalInventoryData();
  const ownedTotal = inventoryData?.ownedTotal ?? 0;
  const isLoading = inventoryData?.isLoading ?? false;
  const totalRequired = inventoryData?.totalRequired ?? numParts;

  const progressPct =
    totalRequired > 0 ? Math.round((ownedTotal / totalRequired) * 100) : 0;
  const hasParticipants = searchPartyActive && participants.length > 0;

  const visibleParticipants = hasParticipants
    ? [...participants]
        .filter(p => !hiddenParticipantIds?.has(p.id))
        .sort((a, b) => b.piecesFound - a.piecesFound)
    : [];

  return (
    <div className="border-b border-subtle bg-card px-3 pb-1.5 lg:col-start-2">
      {/* Main progress bar */}
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={ownedTotal}
          aria-valuemax={totalRequired}
          aria-label="Set build progress"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
        >
          <div
            className="h-full rounded-full bg-theme-primary transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-2xs font-semibold text-foreground-muted tabular-nums">
          {isLoading ? '…' : `${ownedTotal}/${totalRequired}`}
        </span>
      </div>

      {/* Search Party participant bars */}
      {visibleParticipants.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {visibleParticipants.map((p, i) => {
            const color = getSlotColor(p.colorSlot, i);
            const pct =
              totalRequired > 0
                ? Math.round((p.piecesFound / totalRequired) * 100)
                : 0;
            const isYou = p.id === currentParticipantId;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex w-16 items-center gap-1 truncate sm:w-20">
                  <span
                    className="inline-block size-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className={cn(
                      'truncate text-2xs',
                      isYou ? 'font-bold' : 'font-medium text-foreground-muted'
                    )}
                  >
                    {isYou ? 'You' : p.displayName}
                  </span>
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="w-8 text-2xs font-semibold text-foreground-muted tabular-nums">
                  {p.piecesFound}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
