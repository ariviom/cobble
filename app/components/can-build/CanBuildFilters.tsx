'use client';

import { Checkbox } from '@/app/components/ui/Checkbox';
import { DualRangeSlider } from '@/app/components/ui/DualRangeSlider';

type CanBuildFiltersProps = {
  minParts: number;
  maxParts: number;
  onPieceRangeChange: (range: [number, number]) => void;
  minCoverage: number;
  onCoverageChange: (value: number) => void;
  excludeMinifigs: boolean;
  onExcludeMinifigsChange: (value: boolean) => void;
  theme: string;
  onThemeChange: (value: string) => void;
};

export function CanBuildFilters({
  minParts,
  maxParts,
  onPieceRangeChange,
  minCoverage,
  onCoverageChange,
  excludeMinifigs,
  onExcludeMinifigsChange,
  theme,
  onThemeChange,
}: CanBuildFiltersProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4">
      <div className="flex flex-col gap-4">
        {/* Piece count range */}
        <div>
          <label className="text-xs font-bold tracking-wide text-foreground-muted uppercase">
            Piece Count
          </label>
          <DualRangeSlider
            min={1}
            max={5000}
            step={10}
            value={[minParts, maxParts]}
            onChange={onPieceRangeChange}
            formatLabel={v => v.toLocaleString()}
          />
        </div>

        {/* Coverage threshold */}
        <div>
          <label className="text-xs font-bold tracking-wide text-foreground-muted uppercase">
            Minimum Coverage
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={minCoverage}
              onChange={e => onCoverageChange(Number(e.target.value))}
              className="w-full accent-theme-primary"
            />
            <span className="text-sm font-medium text-foreground-muted">
              {minCoverage}%
            </span>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={excludeMinifigs}
              onChange={e => onExcludeMinifigsChange(e.target.checked)}
            />
            <span className="text-sm text-foreground">Exclude minifigures</span>
          </label>

          <input
            type="text"
            value={theme}
            onChange={e => onThemeChange(e.target.value)}
            placeholder="Filter by theme..."
            className="max-w-xs min-w-0 flex-1 rounded-md border-2 border-subtle bg-card px-3 py-2 text-sm outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20"
          />
        </div>
      </div>
    </div>
  );
}
