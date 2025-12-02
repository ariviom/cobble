import Image from 'next/image';
import Link from 'next/link';

export type PublicSetCardProps = {
  setNumber: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number | null;
  themeLabel?: string | null;
  className?: string;
};

export function PublicSetCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeLabel,
  className,
}: PublicSetCardProps) {
  const metadataParts: string[] = [setNumber];
  if (year) {
    metadataParts.push(String(year));
  }
  if (typeof numParts === 'number' && Number.isFinite(numParts) && numParts > 0) {
    metadataParts.push(`${numParts} parts`);
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-subtle bg-card ${className ?? ''}`}
    >
      <Link
        href={`/sets/id/${encodeURIComponent(setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-card-muted">
            <div className="relative mx-auto w-full max-w-full bg-card p-2">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt=""
                  width={512}
                  height={512}
                  className="aspect-square h-full w-full overflow-hidden rounded-lg object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-foreground-muted">
                  No Image
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              {themeLabel && (
                <div className="w-full text-sm font-medium text-foreground-muted">
                  {themeLabel}
                </div>
              )}
              <div className="line-clamp-1 w-full overflow-hidden font-medium">
                {name}
              </div>
              <div className="mt-1 w-full text-xs text-foreground-muted">
                {metadataParts.join(' | ')}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}



