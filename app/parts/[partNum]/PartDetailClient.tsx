'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { SetDetailModal } from '@/app/components/set/SetDetailModal';
import { cn } from '@/app/components/ui/utils';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';

type PartColor = {
  color_id: number;
  name: string;
  rgb: string | null;
};

type RarityRow = {
  set_count: number;
  color_id: number;
};

type SetMeta = {
  set_num: string;
  name: string | null;
  year: number | null;
  image_url: string | null;
};

type Props = {
  part: {
    part_num: string;
    name: string;
    part_cat_id: number | null;
    bl_part_id: string | null;
  };
  colors: PartColor[];
  rarityData: RarityRow[];
  sets: SetMeta[];
};

export function PartDetailClient({ part, colors, rarityData, sets }: Props) {
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [modalSet, setModalSet] = useState<{
    setNumber: string;
    name: string;
    imageUrl: string | null;
    year?: number;
  } | null>(null);

  const rarityByColorId = new Map<number, number>(
    rarityData.map(r => [r.color_id, r.set_count])
  );

  const totalSetCount = rarityData.reduce(
    (acc, r) => acc + (r.set_count ?? 0),
    0
  );

  const selectedRarity =
    selectedColorId != null
      ? (rarityByColorId.get(selectedColorId) ?? 0)
      : null;

  // We can't filter sets by color without re-fetching, so show all sets
  // and indicate color is selected. A future improvement can pass color info.
  const filteredSets = sets;

  const blPartId = part.bl_part_id ?? part.part_num;
  const blUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(blPartId)}`;
  const rbUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.part_num)}/`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="mb-1 font-mono text-sm text-foreground-muted">
          {part.part_num}
        </p>
        <h1 className="text-2xl font-bold text-foreground">{part.name}</h1>

        {/* External links */}
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={rbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            Rebrickable
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={blUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            BrickLink
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Colors section */}
      {colors.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground-muted uppercase">
            Available Colors
            <span className="ml-2 font-normal normal-case">
              ({colors.length})
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {colors.map(color => {
              const isSelected = selectedColorId === color.color_id;
              const count = rarityByColorId.get(color.color_id);
              return (
                <button
                  key={color.color_id}
                  onClick={() =>
                    setSelectedColorId(isSelected ? null : color.color_id)
                  }
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    isSelected
                      ? 'border-theme-primary bg-theme-primary/10 text-foreground'
                      : 'border-subtle bg-card text-foreground-muted hover:border-foreground-muted hover:text-foreground'
                  )}
                >
                  {color.rgb && (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: `#${color.rgb}` }}
                    />
                  )}
                  {color.name}
                  {count != null && (
                    <span className="text-foreground-muted">
                      &middot; {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedColorId != null && selectedRarity != null && (
            <p className="mt-3 text-sm text-foreground-muted">
              This color appears in{' '}
              <span className="font-semibold text-foreground">
                {selectedRarity}
              </span>{' '}
              {selectedRarity === 1 ? 'set' : 'sets'}.{' '}
              <button
                onClick={() => setSelectedColorId(null)}
                className="text-theme-primary hover:underline"
              >
                Show all colors
              </button>
            </p>
          )}
        </section>
      )}

      {/* Sets section */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground-muted uppercase">
          Sets Containing This Part
          <span className="ml-2 font-normal normal-case">
            ({selectedRarity != null ? selectedRarity : totalSetCount})
          </span>
        </h2>

        {filteredSets.length === 0 ? (
          <p className="text-sm text-foreground-muted">No sets found.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filteredSets.map(set => (
              <li key={set.set_num}>
                <button
                  type="button"
                  onClick={() =>
                    setModalSet({
                      setNumber: set.set_num,
                      name: set.name ?? set.set_num,
                      imageUrl: set.image_url,
                      ...(set.year != null && { year: set.year }),
                    })
                  }
                  className="group flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-subtle bg-card text-left transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-background-muted">
                    {set.image_url ? (
                      <OptimizedImage
                        src={set.image_url}
                        alt={set.name ?? set.set_num}
                        variant="setCard"
                        className="object-contain p-2 transition-transform duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <ImagePlaceholder variant="fill" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {set.name ?? set.set_num}
                    </p>
                    <p className="font-mono text-2xs text-foreground-muted">
                      {set.set_num}
                      {set.year != null && ` · ${set.year}`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalSet && (
        <SetDetailModal
          open={!!modalSet}
          onClose={() => setModalSet(null)}
          setNumber={modalSet.setNumber}
          setName={modalSet.name}
          imageUrl={modalSet.imageUrl}
          year={modalSet.year}
        />
      )}
    </div>
  );
}
