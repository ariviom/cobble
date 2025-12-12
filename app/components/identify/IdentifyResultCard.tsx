'use client';

import { useMinifigMeta } from '@/app/hooks/useMinifigMeta';
import { formatMinifigId } from '@/app/lib/minifigIds';
import type { IdentifyCandidate, IdentifyPart } from './types';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';

export function IdentifyResultCard({
  part,
  candidates,
  onSelectCandidate,
  colorOptions,
  selectedColorId,
  onChangeColor,
  showConfidence = true,
}: {
  part: IdentifyPart | null;
  candidates: IdentifyCandidate[];
  onSelectCandidate?: (c: IdentifyCandidate) => void;
  colorOptions?: Array<{ id: number; name: string }>;
  selectedColorId?: number | null;
  onChangeColor?: (id: number | null) => void;
  showConfidence?: boolean;
}) {
  const hasPart = Boolean(part?.partNum);
  const partNum = part?.partNum ?? '';
  const looksLikeRbFigId = /^fig-[a-z0-9]+$/i.test(partNum);
  const rebrickableFigId =
    part?.rebrickableFigId ?? (looksLikeRbFigId ? partNum : null);
  const isMinifig = (part?.isMinifig ?? false) || Boolean(rebrickableFigId);

  const idLabel = isMinifig
    ? formatMinifigId({
        bricklinkId: part?.bricklinkFigId ?? undefined,
        rebrickableId: rebrickableFigId ?? undefined,
      }).label
    : partNum;

  const { meta } = useMinifigMeta(
    isMinifig && rebrickableFigId ? rebrickableFigId : ''
  );

  if (!hasPart) {
    return null;
  }

  const partSafe = part as IdentifyPart;

  const displayName =
    (isMinifig && meta?.name && meta.name.trim()) || partSafe.name || partNum;
  const displayImageUrl = (isMinifig && meta?.imageUrl) || partSafe.imageUrl;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-subtle bg-card p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded bg-card-muted p-2">
          {displayImageUrl ? (
            <OptimizedImage
              src={displayImageUrl}
              alt={displayName}
              variant="identifyResult"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-xs text-foreground-muted">No Image</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{displayName}</div>
          <div className="mt-1 text-xs text-foreground-muted">
            {idLabel}
            {showConfidence &&
              typeof partSafe.confidence === 'number' &&
              !Number.isNaN(partSafe.confidence) && (
                <> • confidence {(partSafe.confidence * 100).toFixed(0)}%</>
              )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {typeof selectedColorId !== 'undefined' &&
              onChangeColor &&
              (colorOptions?.length ?? 0) > 1 && (
                <select
                  className="rounded-md border border-subtle bg-card px-2 py-1 text-xs"
                  value={selectedColorId ?? ''}
                  onChange={e =>
                    onChangeColor(
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                >
                  <option value="">All colors</option>
                  {(colorOptions ?? []).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
          </div>
        </div>
      </div>
      {candidates.length > 1 && onSelectCandidate && (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidates.slice(0, 5).map(c => (
            <button
              key={c.partNum}
              onClick={() => onSelectCandidate(c)}
              className="rounded-md border border-subtle bg-card px-2 py-1 text-xs hover:bg-card-muted"
              title={c.name}
            >
              {c.partNum} {(c.confidence * 100).toFixed(0)}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
