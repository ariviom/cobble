'use client';

type MinifigStatus = 'owned' | 'want';

type MinifigCardProps = {
  figNum: string;
  name: string;
  status: MinifigStatus;
  numParts?: number | null;
};

function getStatusMeta(status: MinifigStatus): { label: string; className: string } {
  switch (status) {
    case 'owned':
      return { label: 'Owned', className: 'bg-emerald-100 text-emerald-700' };
    case 'want':
      return { label: 'Wishlist', className: 'bg-amber-100 text-amber-800' };
    default:
      return { label: 'Wishlist', className: 'bg-amber-100 text-amber-800' };
  }
}

export function MinifigCard({
  figNum,
  name,
  status,
  numParts,
}: MinifigCardProps) {
  const statusMeta = getStatusMeta(status);

  return (
    <div className="rounded-lg border border-subtle bg-card p-3 shadow-sm transition-colors hover:border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">
            {name}
          </span>
          <span className="text-xs text-foreground-muted">{figNum}</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>
      {typeof numParts === 'number' && numParts > 0 && (
        <p className="mt-3 text-[11px] text-foreground-muted">
          {numParts} parts
        </p>
      )}
    </div>
  );
}


