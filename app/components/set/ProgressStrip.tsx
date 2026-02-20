'use client';

import { cn } from '@/app/components/ui/utils';
import { useOptionalInventoryData } from '@/app/components/set/InventoryProvider';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useCallback, useState } from 'react';

/** 8 participant colors (Tailwind 500-level, work on light + dark backgrounds). */
export const PARTICIPANT_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
] as const;

const COLLAPSE_KEY = 'sp-strip-collapsed';

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
};

function getParticipantColor(participant: Participant, index: number): string {
  const slot = participant.colorSlot;
  if (slot != null && slot >= 1 && slot <= 8) {
    return PARTICIPANT_COLORS[slot - 1];
  }
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

export function ProgressStrip({
  numParts,
  searchPartyActive,
  participants = [],
  currentParticipantId,
}: ProgressStripProps) {
  const inventoryData = useOptionalInventoryData();
  const ownedTotal = inventoryData?.ownedTotal ?? 0;
  const isLoading = inventoryData?.isLoading ?? false;
  const totalRequired = inventoryData?.totalRequired ?? numParts;

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const progressPct =
    totalRequired > 0 ? Math.round((ownedTotal / totalRequired) * 100) : 0;
  const hasParticipants = searchPartyActive && participants.length > 0;

  const sortedParticipants = hasParticipants
    ? [...participants].sort((a, b) => b.piecesFound - a.piecesFound)
    : [];

  return (
    <div className="border-b border-subtle bg-card px-3 py-1.5 lg:col-start-2">
      {/* Main progress bar */}
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={ownedTotal}
          aria-valuemax={totalRequired}
          aria-label="Set build progress"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-muted"
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

      {/* Search Party participant bars — expanded */}
      {hasParticipants && !collapsed && (
        <div className="mt-1.5 space-y-1">
          {sortedParticipants.map((p, i) => {
            const color = getParticipantColor(p, i);
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
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-background-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="w-6 text-right text-2xs font-semibold text-foreground-muted tabular-nums">
                  {p.piecesFound}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Search Party collapse/expand toggle */}
      {hasParticipants && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="mt-1 flex w-full items-center justify-end gap-1 text-2xs font-medium text-foreground-muted hover:text-foreground"
        >
          {collapsed ? (
            <>
              <Users className="size-3" />
              {participants.length} searching
              <ChevronDown className="size-3" />
            </>
          ) : (
            <>
              Hide
              <ChevronUp className="size-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
