'use client';

import { useMinifigMeta } from '@/app/hooks/useMinifigMeta';
import { formatMinifigId } from '@/app/lib/minifigIds';
import type { IdentifyCandidate, IdentifyPart } from './types';

export function IdentifyResultCard({
  part,
  candidates,
  onSelectCandidate,
  colorOptions,
  selectedColorId,
  onChangeColor,
  showConfidence = true,
}: {
  part: IdentifyPart;
  candidates: IdentifyCandidate[];
  onSelectCandidate?: (c: IdentifyCandidate) => void;
  colorOptions?: Array<{ id: number; name: string }>;
  selectedColorId?: number | null;
  onChangeColor?: (id: number | null) => void;
  showConfidence?: boolean;
}) {
  const looksLikeRbFigId = /^fig-[a-z0-9]+$/i.test(part.partNum);
  const rebrickableFigId =
    part.rebrickableFigId ?? (looksLikeRbFigId ? part.partNum : null);
  const isMinifig = part.isMinifig === true || Boolean(rebrickableFigId);

  const idLabel = isMinifig
    ? formatMinifigId({
        bricklinkId: part.bricklinkFigId ?? undefined,
        rebrickableId: rebrickableFigId ?? undefined,
      }).label
    : part.partNum;

  const { meta } = useMinifigMeta(
    isMinifig && rebrickableFigId ? rebrickableFigId : ''
  );

  const displayName =
    (isMinifig && meta?.name && meta.name.trim()) || part.name;
  const displayImageUrl = (isMinifig && meta?.imageUrl) || part.imageUrl;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-subtle bg-card p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded bg-card-muted p-2">
          {displayImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayImageUrl}
              alt=""
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
              typeof part.confidence === 'number' &&
              !Number.isNaN(part.confidence) && (
                <> • confidence {(part.confidence * 100).toFixed(0)}%</>
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
