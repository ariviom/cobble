import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import Image from 'next/image';

type SetCardBodyProps = {
  imageUrl: string | null;
  onImageError?: () => void;
  displayName: string;
  metadataText: string;
  themeLabel?: string | null | undefined;
  /** Add `truncate` to the theme label (e.g., for smaller card variants). */
  truncateTheme?: boolean | undefined;
};

export function SetCardBody({
  imageUrl,
  onImageError,
  displayName,
  metadataText,
  themeLabel,
  truncateTheme,
}: SetCardBodyProps) {
  return (
    <>
      <div className="p-2">
        {imageUrl ? (
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
            <Image
              src={imageUrl}
              alt=""
              fill
              className="rounded-sm object-contain p-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              onError={onImageError}
            />
          </div>
        ) : (
          <ImagePlaceholder variant="card" />
        )}
      </div>
      <div className="flex items-start gap-2 px-2 py-3 sm:px-3">
        <div className="min-w-0 flex-1">
          {themeLabel && (
            <div
              className={
                truncateTheme
                  ? 'mb-1 w-full truncate text-xs font-bold tracking-wide text-theme-text uppercase'
                  : 'mb-1 w-full text-xs font-bold tracking-wide text-theme-text uppercase'
              }
            >
              {themeLabel}
            </div>
          )}
          <div className="line-clamp-2 w-full leading-tight font-bold text-foreground">
            {displayName}
          </div>
          <div className="mt-1 w-full text-2xs font-semibold text-foreground-muted">
            {metadataText}
          </div>
        </div>
      </div>
    </>
  );
}
