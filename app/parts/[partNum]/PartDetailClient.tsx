'use client';

import { useState, useMemo, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { SetDetailModal } from '@/app/components/set/SetDetailModal';
import { Card } from '@/app/components/ui/Card';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { ColorPicker } from '@/app/components/collection/parts/ColorPicker';
import { LooseQuantityControl } from '@/app/components/collection/parts/LooseQuantityControl';
import { groupColors } from '@/app/components/collection/parts/colorGroups';
import {
  bulkUpsertLooseParts,
  getLoosePart,
} from '@/app/lib/localDb/loosePartsStore';

type PartColor = {
  color_id: number;
  name: string;
  rgb: string | null;
};

type RarityRow = {
  set_count: number;
  color_id: number;
};

type SetResult = {
  setNumber: string;
  name: string | null;
  year: number | null;
  imageUrl: string | null;
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
};

export function PartDetailClient({ part, colors, rarityData }: Props) {
  const [selectedColorId, setSelectedColorId] = useState<number>(
    // Default to first color, prefer white (15), then black (0)
    colors.find(c => c.color_id === 15)?.color_id ??
      colors.find(c => c.color_id === 0)?.color_id ??
      colors[0]?.color_id ??
      0
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [looseQty, setLooseQty] = useState(0);
  const [ownedFromSets, setOwnedFromSets] = useState(0);
  const [colorImageUrl, setColorImageUrl] = useState<string | null>(null);
  const [modalSet, setModalSet] = useState<{
    setNumber: string;
    name: string;
    imageUrl: string | null;
    year?: number;
  } | null>(null);

  // Paginated sets
  const [setsData, setSetsData] = useState<SetResult[]>([]);
  const [setsPage, setSetsPage] = useState(1);
  const [setsTotal, setSetsTotal] = useState<number | null>(null);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsHasMore, setSetsHasMore] = useState(false);

  // Map colors to the format ColorPicker expects
  const availableColors = useMemo(
    () =>
      colors.map(c => ({
        colorId: c.color_id,
        colorName: c.name,
        rgb: c.rgb,
        imageUrl: null as string | null,
      })),
    [colors]
  );

  const colorGroups = useMemo(
    () => groupColors(availableColors),
    [availableColors]
  );

  // Auto-expand gray group on mount
  useEffect(() => {
    if (!colorGroups.length) return;
    const gray = colorGroups.find(g => g.key === 'gray');
    setExpandedGroup(gray ? 'gray' : colorGroups[0]!.key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load loose quantity + owned count when color changes
  useEffect(() => {
    let cancelled = false;

    const loosePromise = getLoosePart(part.part_num, selectedColorId);
    const ownedPromise = fetch(
      `/api/parts/owned?partNum=${encodeURIComponent(part.part_num)}&colorId=${selectedColorId}`
    )
      .then(res => (res.ok ? res.json() : { total: 0 }))
      .catch(() => ({ total: 0 }));

    Promise.all([loosePromise, ownedPromise]).then(
      ([looseEntry, ownedData]) => {
        if (cancelled) return;
        setLooseQty(looseEntry?.quantity ?? 0);
        setOwnedFromSets(ownedData.total);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [part.part_num, selectedColorId]);

  // Fetch per-color image
  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/search/parts/image?partNum=${encodeURIComponent(part.part_num)}&colorId=${selectedColorId}`
    )
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data?.imageUrl) {
          const img = new window.Image();
          img.onload = () => {
            if (!cancelled) setColorImageUrl(data.imageUrl);
          };
          img.src = data.imageUrl;
        } else {
          setColorImageUrl(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [part.part_num, selectedColorId]);

  // Load sets on mount (page 1), then more on demand
  useEffect(() => {
    let cancelled = false;
    setSetsLoading(true);
    fetch(`/api/parts/sets?partNum=${encodeURIComponent(part.part_num)}&page=1`)
      .then(res =>
        res.ok ? res.json() : { results: [], nextPage: null, total: 0 }
      )
      .then(data => {
        if (cancelled) return;
        setSetsData(data.results);
        setSetsHasMore(!!data.nextPage);
        setSetsTotal(data.total ?? null);
        setSetsPage(1);
        setSetsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setSetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [part.part_num]);

  const loadMoreSets = () => {
    if (setsLoading || !setsHasMore) return;
    const nextPage = setsPage + 1;
    setSetsLoading(true);
    fetch(
      `/api/parts/sets?partNum=${encodeURIComponent(part.part_num)}&page=${nextPage}`
    )
      .then(res => (res.ok ? res.json() : { results: [], nextPage: null }))
      .then(data => {
        setSetsData(prev => [...prev, ...data.results]);
        setSetsHasMore(!!data.nextPage);
        setSetsPage(nextPage);
        setSetsLoading(false);
      })
      .catch(() => setSetsLoading(false));
  };

  const handleLooseChange = async (next: number) => {
    setLooseQty(next);
    await bulkUpsertLooseParts(
      [{ partNum: part.part_num, colorId: selectedColorId, quantity: next }],
      'replace'
    );
  };

  const selectedColor = colors.find(c => c.color_id === selectedColorId);
  const rarityByColorId = new Map<number, number>(
    rarityData.map(r => [r.color_id, r.set_count])
  );
  const selectedRarity = rarityByColorId.get(selectedColorId) ?? 0;

  const blPartId = part.bl_part_id ?? part.part_num;
  const blUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(blPartId)}`;
  const rbUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.part_num)}/${selectedColorId}/`;

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      {/* Hero card */}
      <Card elevated padding="none" className="overflow-hidden">
        {/* Image hero */}
        <div className="relative flex items-center justify-center bg-gradient-to-b from-card-muted to-card px-6 py-8 sm:py-12">
          <div className="relative size-48 sm:size-64">
            {colorImageUrl ? (
              <Image
                src={colorImageUrl}
                alt={part.name}
                fill
                sizes="(min-width: 640px) 256px, 192px"
                className="object-contain drop-shadow-lg"
                priority
              />
            ) : (
              <ImagePlaceholder
                variant="card"
                className="size-full rounded-lg"
              />
            )}
          </div>
        </div>

        {/* Identity section */}
        <div className="border-t border-subtle px-5 py-4 sm:px-6">
          <h1 className="text-lg leading-tight font-bold text-foreground">
            {part.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
            <span className="font-mono">{part.part_num}</span>
            {selectedColor && (
              <>
                <span>·</span>
                <span>{selectedColor.name}</span>
              </>
            )}
            {selectedRarity > 0 && (
              <>
                <span>·</span>
                <span>
                  {selectedRarity} {selectedRarity === 1 ? 'set' : 'sets'}
                </span>
              </>
            )}
          </div>
          {/* External links */}
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href={rbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
            >
              Rebrickable
              <ExternalLink className="size-3.5" />
            </a>
            <a
              href={blUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
            >
              BrickLink
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>

        {/* Color picker */}
        {availableColors.length > 0 && (
          <div className="border-t border-subtle px-5 py-4 sm:px-6">
            <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
              Colors
              <span className="ml-1 font-normal normal-case">
                ({availableColors.length})
              </span>
            </p>
            <ColorPicker
              colorGroups={colorGroups}
              allColors={availableColors}
              selectedColorId={selectedColorId}
              expandedGroup={expandedGroup}
              onExpandGroup={setExpandedGroup}
              onSelectColor={setSelectedColorId}
            />
          </div>
        )}

        {/* Owned / Loose */}
        <div className="flex gap-px border-t border-subtle bg-subtle">
          <div className="flex-1 bg-card px-5 py-3 sm:px-6">
            <p className="mb-1 text-xs font-medium text-foreground-muted uppercase">
              Owned
            </p>
            <p className="text-2xl font-bold tabular-nums">{ownedFromSets}</p>
          </div>
          <div className="flex-1 bg-card px-5 py-3 sm:px-6">
            <p className="mb-1 text-xs font-medium text-foreground-muted uppercase">
              Loose
            </p>
            <p className="text-2xl font-bold tabular-nums">{looseQty}</p>
          </div>
        </div>

        {/* Loose quantity editor */}
        <div className="border-t border-subtle px-5 py-4 sm:px-6">
          <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
            Loose quantity
          </p>
          <LooseQuantityControl
            key={selectedColorId}
            value={looseQty}
            onChange={handleLooseChange}
          />
        </div>
      </Card>

      {/* Sets containing this part */}
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground-muted uppercase">
          Sets Containing This Part
          {setsTotal != null && (
            <span className="ml-2 font-normal normal-case">({setsTotal})</span>
          )}
        </h2>

        {!setsLoading && setsData.length === 0 ? (
          <p className="text-sm text-foreground-muted">No sets found.</p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {setsData.map(set => (
                <li key={set.setNumber}>
                  <button
                    type="button"
                    onClick={() =>
                      setModalSet({
                        setNumber: set.setNumber,
                        name: set.name ?? set.setNumber,
                        imageUrl: set.imageUrl,
                        ...(set.year != null && { year: set.year }),
                      })
                    }
                    className="group flex w-full flex-col overflow-hidden rounded-lg border border-subtle bg-card text-left transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-background-muted">
                      {set.imageUrl ? (
                        <OptimizedImage
                          src={set.imageUrl}
                          alt={set.name ?? set.setNumber}
                          variant="setCard"
                          className="object-contain p-2 transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <ImagePlaceholder variant="fill" />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {set.name ?? set.setNumber}
                      </p>
                      <p className="font-mono text-2xs text-foreground-muted">
                        {set.setNumber}
                        {set.year != null && ` · ${set.year}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {setsHasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={loadMoreSets}
                  disabled={setsLoading}
                  className="rounded-lg border border-subtle bg-card px-4 py-2 text-sm hover:bg-card-muted"
                >
                  {setsLoading ? 'Loading…' : 'Load More'}
                </button>
              </div>
            )}
            {setsLoading && setsData.length === 0 && (
              <p className="text-center text-sm text-foreground-muted">
                Loading sets…
              </p>
            )}
          </>
        )}
      </div>

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
    </section>
  );
}
