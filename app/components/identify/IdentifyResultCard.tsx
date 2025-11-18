'use client';
import type { IdentifyCandidate, IdentifyPart } from './types';

export function IdentifyResultCard({
  part,
  candidates,
  onSelectCandidate,
  colorOptions,
  selectedColorId,
  onChangeColor,
}: {
  part: IdentifyPart;
  candidates: IdentifyCandidate[];
  onSelectCandidate?: (c: IdentifyCandidate) => void;
  colorOptions?: Array<{ id: number; name: string }>;
  selectedColorId?: number | null;
  onChangeColor?: (id: number | null) => void;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-neutral-200 bg-white p-4 dark:bg-background">
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded bg-neutral-50 p-2">
          {part.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={part.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-xs text-foreground-muted">no img</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{part.name}</div>
          <div className="mt-1 text-xs text-foreground-muted">
            {part.partNum} • confidence {(part.confidence * 100).toFixed(0)}%
          </div>
          <div className="mt-2 flex items-center gap-2">
            {typeof selectedColorId !== 'undefined' &&
              onChangeColor &&
              (colorOptions?.length ?? 0) > 1 && (
                <select
                  className="rounded border px-2 py-1 text-xs"
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
              className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
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
