'use client';

type PublicMinifigCardProps = {
  figNum: string;
  name: string;
  numParts?: number | null;
  status?: 'owned' | 'want' | null;
};

function getStatusLabel(status: PublicMinifigCardProps['status']): {
  label: string;
  className: string;
} | null {
  switch (status) {
    case 'owned':
      return { label: 'Owned', className: 'bg-emerald-100 text-emerald-700' };
    case 'want':
      return { label: 'Wishlist', className: 'bg-amber-100 text-amber-800' };
    default:
      return null;
  }
}

export function PublicMinifigCard({
  figNum,
  name,
  numParts,
  status,
}: PublicMinifigCardProps) {
  const statusMeta = getStatusLabel(status);

  return (
    <div className="rounded-lg border border-subtle bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">
          {name}
        </span>
        <span className="text-xs text-foreground-muted">{figNum}</span>
      </div>
      {typeof numParts === 'number' && numParts > 0 && (
        <p className="mt-2 text-[11px] text-foreground-muted">{numParts} parts</p>
      )}
      {statusMeta && (
        <div className="mt-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
        </div>
      )}
    </div>
  );
}


