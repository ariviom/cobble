import { NextRequest, NextResponse } from 'next/server';
import {
  getPart,
  getPartColorsForPart,
  getSetSummary,
  getSetsForMinifig,
  getSetsForPart,
  mapBrickLinkColorIdToRebrickableColorId,
  resolvePartIdToRebrickable,
  type PartAvailableColor,
  type PartInSet,
} from '@/app/lib/rebrickable';
import {
  blGetPartSupersets,
  type BLSupersetItem,
} from '@/app/lib/bricklink';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const part = searchParams.get('part');
  const colorIdRaw = searchParams.get('colorId');
  const blColorIdRaw = searchParams.get('blColorId');

  if (!part) {
    return NextResponse.json({ error: 'missing_part' });
  }

  // Minifig path: we use our internal fig: prefix to signal a minifigure id.
  if (part.startsWith('fig:')) {
    const figNum = part.slice(4).trim();
    if (!figNum) {
      return NextResponse.json({
        error: 'missing_minifig_id',
        part: { partNum: part, name: '', imageUrl: null },
        sets: [],
      });
    }
    try {
      let sets: PartInSet[] = [];
      try {
        sets = await getSetsForMinifig(figNum);
      } catch {
        sets = [];
      }
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.log('identify/sets (minifig)', {
            inputPart: part,
            figNum,
            setsCount: sets.length,
          });
        } catch {
          // ignore logging failures
        }
      }
      return NextResponse.json({
        part: {
          partNum: figNum,
          name: figNum,
          imageUrl: null,
        },
        availableColors: [] as PartAvailableColor[],
        selectedColorId: null,
        sets,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.log('identify/sets minifig failed', {
            part,
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // ignore logging failures
        }
      }
      return NextResponse.json({
        error: 'identify_sets_failed',
        part: { partNum: part, name: '', imageUrl: null },
        sets: [],
      });
    }
  }

  const colorId =
    colorIdRaw && colorIdRaw.trim() !== '' ? Number(colorIdRaw) : undefined;
  let rbPart = part;

  try {
    let selectedColorId = colorId;

    // Resolve BL part to RB if needed for colors + sets call
    try {
      await getPart(rbPart);
    } catch {
      try {
        const resolved = await resolvePartIdToRebrickable(part, {
          bricklinkId: part,
        });
        if (resolved?.partNum) {
          rbPart = resolved.partNum;
        }
      } catch {
        // keep original
      }
    }

    let availableColors: PartAvailableColor[] = [];
    try {
      availableColors = await getPartColorsForPart(rbPart);
      if (selectedColorId == null && availableColors.length === 1) {
        selectedColorId = availableColors[0]!.id;
      }
    } catch {
      availableColors = [];
    }

    // Map BL color if provided and no RB color yet
    if (
      selectedColorId == null &&
      blColorIdRaw &&
      blColorIdRaw.trim() !== ''
    ) {
      try {
        const mapped = await mapBrickLinkColorIdToRebrickableColorId(
          Number(blColorIdRaw)
        );
        if (typeof mapped === 'number') selectedColorId = mapped;
      } catch {
        // ignore color mapping failures
      }
    }

    let sets: PartInSet[] = [];
    if (typeof selectedColorId === 'number') {
      // Single-color path: respect the explicit RB color id.
      try {
        sets = await getSetsForPart(rbPart, selectedColorId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Rebrickable error 404')) {
          // Retry without color filter if not found
          try {
            sets = await getSetsForPart(rbPart, undefined);
          } catch {
            sets = [];
          }
        } else {
          sets = [];
        }
      }
    } else {
      // "All colors" path: when the user selects "All colors" in the UI we
      // receive no color filter. For parts where only color-scoped endpoints
      // return data, union sets across all known RB colors instead of calling
      // the unscoped /sets endpoint, which may be empty.
      const colorList = availableColors ?? [];
      if (colorList.length > 0 && colorList.length <= 10) {
        const bySet = new Map<string, PartInSet>();
        for (const c of colorList) {
          let perColor: PartInSet[] = [];
          try {
            perColor = await getSetsForPart(rbPart, c.id);
          } catch {
            perColor = [];
          }
          for (const s of perColor) {
            const existing = bySet.get(s.setNumber);
            if (!existing) {
              bySet.set(s.setNumber, { ...s });
            } else {
              existing.quantity += s.quantity;
              if (s.year > existing.year) existing.year = s.year;
              if (!existing.imageUrl && s.imageUrl) {
                existing.imageUrl = s.imageUrl;
              }
            }
          }
        }
        sets = [...bySet.values()];
      } else {
        // Fallback: behave like the previous implementation and ask RB for
        // unscoped sets when we either have no color data or too many colors.
        try {
          sets = await getSetsForPart(rbPart, undefined);
        } catch {
          sets = [];
        }
      }
    }

    let partMetaName = '';
    let partMetaImage: string | null = null;
    let blPartId: string | null = null;
    try {
      const partMeta = await getPart(rbPart);
      partMetaName = partMeta.name;
      partMetaImage = partMeta.part_img_url;

      const external = (partMeta.external_ids as {
        BrickLink?: { ext_ids?: unknown[] };
      } | undefined)?.BrickLink;
      const extIds: unknown[] = Array.isArray(external?.ext_ids)
        ? external!.ext_ids!
        : [];
      const firstId = extIds.find(
        id => typeof id === 'string' || typeof id === 'number'
      );
      if (firstId !== undefined && firstId !== null) {
        blPartId = String(firstId);
      }
    } catch {
      // tolerate missing metadata
    }

    // If Rebrickable has no sets for this part, fall back to BrickLink
    // supersets using the derived BL part id when available. This is
    // particularly important for minifig parts, which often appear in
    // sets only via assemblies or minifig inventories.
    if (!sets.length && blPartId) {
      try {
        let supersets: BLSupersetItem[] = [];
        try {
          supersets = await blGetPartSupersets(blPartId);
        } catch {
          supersets = [];
        }

        let blSets: PartInSet[] = (supersets ?? []).map(s => ({
          setNumber: s.setNumber,
          name: s.name,
          year: 0,
          imageUrl: s.imageUrl,
          quantity: s.quantity,
        }));

        // Enrich BL-derived sets with Rebrickable set metadata (year/image)
        try {
          const top = blSets.slice(0, 20);
          const enriched = await Promise.all(
            top.map(async set => {
              try {
                const summary = await getSetSummary(set.setNumber);
                return {
                  ...set,
                  year: summary.year ?? set.year,
                  imageUrl: summary.imageUrl ?? set.imageUrl,
                };
              } catch {
                return set;
              }
            })
          );
          blSets = [...enriched, ...blSets.slice(top.length)];
        } catch {
          // best-effort enrichment; ignore failures
        }

        if (blSets.length) {
          sets = blSets;
        }
      } catch {
        // ignore BrickLink fallback failures; keep sets as-is (empty)
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      try {
        console.log('identify/sets', {
          inputPart: part,
          resolvedPart: rbPart,
          selectedColorId,
          setsCount: sets.length,
        });
      } catch {
        // ignore logging failures
      }
    }

    // Sort: most parts descending, then year descending
    const sorted = [...sets].sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.year - a.year;
    });

    return NextResponse.json({
      part: {
        partNum: rbPart,
        name: partMetaName,
        imageUrl: partMetaImage,
      },
      availableColors,
      selectedColorId: selectedColorId ?? null,
      sets: sorted,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.log('identify/sets failed', {
          part,
          error: err instanceof Error ? err.message : String(err),
        });
      } catch {
        // ignore logging failures
      }
    }
    // Always-200: return empty sets with minimal part info
    return NextResponse.json({
      error: 'identify_sets_failed',
      part: { partNum: part, name: '', imageUrl: null },
      sets: [],
    });
  }
}