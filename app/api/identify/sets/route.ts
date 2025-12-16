import { errorResponse } from '@/app/lib/api/responses';
import { blGetPartSupersets, type BLSupersetItem } from '@/app/lib/bricklink';
import { getSetsForPartLocal, getSetSummaryLocal } from '@/app/lib/catalog';
import {
  mapBrickLinkFigToRebrickable,
  mapRebrickableFigToBrickLinkOnDemand,
} from '@/app/lib/minifigMapping';
import {
  getPart,
  getPartColorsForPart,
  getSetsForMinifig,
  getSetsForPart,
  getSetSummary,
  mapBrickLinkColorIdToRebrickableColorId,
  resolvePartIdToRebrickable,
  type PartAvailableColor,
  type PartInSet,
} from '@/app/lib/rebrickable';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logEvent, logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const part = searchParams.get('part');
  const colorIdRaw = searchParams.get('colorId');
  const blColorIdRaw = searchParams.get('blColorId');

  if (!part) {
    return errorResponse('missing_required_field', {
      message: 'Part parameter is required',
    });
  }

  const looksLikeBricklinkFig = /^[a-z]{3}\d{3,}$/i.test(part.trim());

  // Minifig path: internal fig: prefix, or BL fig id fallback (e.g., "ext014")
  if (part.startsWith('fig:') || looksLikeBricklinkFig) {
    const tokenRaw = part.startsWith('fig:') ? part.slice(4) : part;
    const token = tokenRaw.trim();
    if (!token) {
      return errorResponse('missing_required_field', {
        message: 'Minifig ID is required',
        details: {
          part: { partNum: part, name: '', imageUrl: null },
          sets: [],
        },
      });
    }
    try {
      let figNum: string | null = null;
      let bricklinkFigId: string | null = null;

      // Prefer treating the token as a BrickLink ID first; if that fails,
      // fall back to using it as a Rebrickable fig id.
      const mappedRb = await mapBrickLinkFigToRebrickable(token);
      if (mappedRb) {
        figNum = mappedRb;
        bricklinkFigId = token;
      } else {
        figNum = token;
        try {
          bricklinkFigId = await mapRebrickableFigToBrickLinkOnDemand(figNum);
        } catch {
          bricklinkFigId = null;
        }
      }

      let sets: PartInSet[] = [];
      if (figNum) {
        try {
          // Catalog-first: use local minifig lookup if available (via getSetsForMinifig which is RB-backed)
          sets = await getSetsForMinifig(figNum);
        } catch {
          sets = [];
        }
      }

      // Resolve a human-friendly minifig name from the catalog when possible.
      let displayName: string = figNum ?? token;
      if (figNum) {
        try {
          const supabase = getSupabaseServiceRoleClient();
          const { data, error } = await supabase
            .from('rb_minifigs')
            .select('name')
            .eq('fig_num', figNum)
            .maybeSingle();
          if (!error && data && typeof data.name === 'string') {
            const trimmedName = data.name.trim();
            if (trimmedName) {
              displayName = trimmedName;
            }
          }
        } catch {
          // best-effort only; fall back to figNum/token
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        logEvent('identify.sets.minifig.debug', {
          inputPart: part,
          figNum: figNum ?? null,
          bricklinkFigId,
          setsCount: sets.length,
        });
      }

      // Enrich sets with catalog summary (local first, then RB)
      if (sets.length) {
        const ENRICH_LIMIT = 30;
        const targets = sets.slice(0, ENRICH_LIMIT);
        const summaries = await Promise.all(
          targets.map(async set => {
            try {
              const summary =
                (await getSetSummaryLocal(set.setNumber)) ??
                (await getSetSummary(set.setNumber));
              return { setNumber: set.setNumber.toLowerCase(), summary };
            } catch {
              return null;
            }
          })
        );
        const summaryBySet = new Map<
          string,
          Awaited<ReturnType<typeof getSetSummary>>
        >();
        for (const item of summaries) {
          if (item?.summary) summaryBySet.set(item.setNumber, item.summary);
        }
        sets = sets.map(s => {
          const summary = summaryBySet.get(s.setNumber.toLowerCase());
          return {
            ...s,
            name: summary?.name ?? s.name ?? s.setNumber,
            year: summary?.year ?? s.year,
            imageUrl: summary?.imageUrl ?? s.imageUrl,
            numParts: summary?.numParts ?? s.numParts ?? null,
            themeId: summary?.themeId ?? s.themeId ?? null,
            themeName: summary?.themeName ?? s.themeName ?? null,
          };
        });
      }

      if (process.env.NODE_ENV !== 'production') {
        logEvent('identify.sets.minifig.enriched', {
          inputPart: part,
          figNum: figNum ?? null,
          bricklinkFigId,
          setsCount: sets.length,
          usedLocal: sets.some(
            s => s.numParts != null || s.themeName != null || s.year !== 0
          ),
        });
      }

      return NextResponse.json({
        part: {
          partNum: figNum ?? token,
          name: displayName,
          imageUrl: null,
          confidence: 0,
          colorId: null,
          colorName: null,
          isMinifig: true,
          rebrickableFigId: figNum,
          bricklinkFigId,
        },
        availableColors: [] as PartAvailableColor[],
        selectedColorId: null,
        sets: sets.map(s => ({
          ...s,
          name: s.name && s.name.trim() ? s.name : s.setNumber,
        })),
      });
    } catch (err) {
      logger.warn('identify.sets.minifig.failed', {
        part,
        error: err instanceof Error ? err.message : String(err),
      });
      return errorResponse('identify_sets_failed', {
        message: 'Failed to identify minifig sets',
        details: {
          part: { partNum: part, name: '', imageUrl: null },
          sets: [],
        },
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
    if (selectedColorId == null && blColorIdRaw && blColorIdRaw.trim() !== '') {
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
    // 1) Try catalog (Supabase) first for full set metadata.
    try {
      const local = await getSetsForPartLocal(rbPart, selectedColorId ?? null);
      if (local.length) {
        sets = local;
      }
    } catch (err) {
      // log and fall back
      logger.warn('identify.sets.local_catalog_failed', {
        part: rbPart,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2) Fallback to Rebrickable when catalog is empty or failed.
    if (sets.length === 0) {
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
    }

    let partMetaName = '';
    let partMetaImage: string | null = null;
    let blPartId: string | null = null;
    try {
      const partMeta = await getPart(rbPart);
      partMetaName = partMeta.name;
      partMetaImage = partMeta.part_img_url;

      const external = (
        partMeta.external_ids as
          | {
              BrickLink?: { ext_ids?: unknown[] };
            }
          | undefined
      )?.BrickLink;
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
          numParts: null,
          themeId: null,
          themeName: null,
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
                  numParts: summary.numParts ?? set.numParts ?? null,
                  themeId: summary.themeId ?? set.themeId ?? null,
                  themeName: summary.themeName ?? set.themeName ?? null,
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
      logEvent('identify.sets', {
        inputPart: part,
        resolvedPart: rbPart,
        selectedColorId,
        setsCount: sets.length,
      });
    }

    // Sort: most parts descending, then year descending
    const sorted = [...sets].sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.year - a.year;
    });

    const needsEnrichment = sorted.some(
      s =>
        !s.name ||
        s.name.trim() === '' ||
        s.year === 0 ||
        s.numParts == null ||
        s.themeName == null
    );

    let finalSets = sorted;

    if (needsEnrichment) {
      // Enrich with full set metadata (numParts/theme) for parity with set search cards.
      const ENRICH_LIMIT = 30;
      const enrichTargets = sorted.slice(0, ENRICH_LIMIT);
      const summaries = await Promise.all(
        enrichTargets.map(async set => {
          try {
            const summary =
              (await getSetSummaryLocal(set.setNumber)) ??
              (await getSetSummary(set.setNumber));
            return { setNumber: set.setNumber.toLowerCase(), summary };
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              logEvent('identify.sets.enrichment_failed', {
                set: set.setNumber,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            return null;
          }
        })
      );
      const summaryBySet = new Map<
        string,
        Awaited<ReturnType<typeof getSetSummary>>
      >();
      for (const item of summaries) {
        if (item?.summary) summaryBySet.set(item.setNumber, item.summary);
      }
      finalSets = sorted.map(s => {
        const summary = summaryBySet.get(s.setNumber.toLowerCase());
        return {
          ...s,
          name: summary?.name ?? s.name ?? s.setNumber,
          year: summary?.year ?? s.year,
          imageUrl: summary?.imageUrl ?? s.imageUrl,
          numParts: summary?.numParts ?? s.numParts ?? null,
          themeId: summary?.themeId ?? s.themeId ?? null,
          themeName: summary?.themeName ?? s.themeName ?? null,
        };
      });
    }

    // Final safety: ensure name is always present (fallback to setNumber).
    finalSets = finalSets.map(s => ({
      ...s,
      name: s.name && s.name.trim() ? s.name : s.setNumber,
    }));

    return NextResponse.json({
      part: {
        partNum: rbPart,
        name: partMetaName,
        imageUrl: partMetaImage,
      },
      availableColors,
      selectedColorId: selectedColorId ?? null,
      sets: finalSets,
    });
  } catch (err) {
    logger.warn('identify.sets.failed', {
      part,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('identify_sets_failed', {
      message: 'Failed to identify part sets',
      details: { part: { partNum: part, name: '', imageUrl: null }, sets: [] },
    });
  }
}
