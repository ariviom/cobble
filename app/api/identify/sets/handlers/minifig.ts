import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { type PartAvailableColor, type PartInSet } from '@/app/lib/rebrickable';
import { logEvent } from '@/lib/metrics';

import { enrichSets, ensureSetNames } from './enrichment';

export type MinifigIdentifyResult = {
  part: {
    partNum: string;
    name: string;
    imageUrl: null;
    confidence: number;
    colorId: null;
    colorName: null;
    isMinifig: true;
    bricklinkFigId: string | null;
  };
  availableColors: PartAvailableColor[];
  selectedColorId: null;
  sets: PartInSet[];
};

/**
 * Identify a minifigure and find sets containing it.
 *
 * Accepts BrickLink minifig IDs (e.g., "sw0001", "cty1234").
 * Reverse-lookups BL→RB fig_num, then queries rb_inventory_minifigs for sets.
 */
export async function handleMinifigIdentify(
  part: string
): Promise<MinifigIdentifyResult> {
  const tokenRaw = part.startsWith('fig:') ? part.slice(4) : part;
  const token = tokenRaw.trim();

  const supabase = getCatalogReadClient();

  // Treat input as BrickLink ID (source of truth for minifigs)
  const bricklinkFigId = token;

  // Reverse-lookup: BL minifig ID → RB fig_num
  const { data: rbMinifig } = await supabase
    .from('rb_minifigs')
    .select('fig_num, name')
    .eq('bl_minifig_id', bricklinkFigId)
    .maybeSingle();

  // Get display name
  const displayName: string = rbMinifig?.name ?? bricklinkFigId;
  const rbFigNum = rbMinifig?.fig_num;

  // Get sets containing this minifig from RB catalog
  let sets: PartInSet[] = [];
  if (rbFigNum) {
    try {
      const { data: invMinifigs } = await supabase
        .from('rb_inventory_minifigs')
        .select('inventory_id, quantity')
        .eq('fig_num', rbFigNum);

      if (invMinifigs && invMinifigs.length > 0) {
        const invIds = invMinifigs.map(im => im.inventory_id);
        const invToQty = new Map<number, number>();
        for (const im of invMinifigs) {
          invToQty.set(im.inventory_id, im.quantity ?? 1);
        }

        // Get set numbers from inventories (exclude fig-* inventories)
        const { data: inventories } = await supabase
          .from('rb_inventories')
          .select('id, set_num')
          .in('id', invIds)
          .not('set_num', 'like', 'fig-%');

        const validInventories = (inventories ?? []).filter(
          (inv): inv is typeof inv & { set_num: string } =>
            typeof inv.set_num === 'string'
        );

        if (validInventories.length > 0) {
          const setNums = [
            ...new Set(validInventories.map(inv => inv.set_num)),
          ];
          const { data: setDetails } = await supabase
            .from('rb_sets')
            .select('set_num, name, year, image_url')
            .in('set_num', setNums);

          const detailMap = new Map(
            (setDetails ?? []).map(s => [s.set_num, s])
          );

          sets = validInventories
            .map(inv => {
              const details = detailMap.get(inv.set_num);
              return {
                setNumber: inv.set_num,
                name: details?.name ?? inv.set_num,
                year: details?.year ?? 0,
                imageUrl: details?.image_url ?? null,
                quantity: invToQty.get(inv.id) ?? 1,
              };
            })
            // Dedup by set_num
            .filter(
              (item, idx, arr) =>
                arr.findIndex(x => x.setNumber === item.setNumber) === idx
            )
            .sort((a, b) => b.quantity - a.quantity || b.year - a.year);
        }
      }
    } catch {
      sets = [];
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets.minifig.debug', {
      inputPart: part,
      bricklinkFigId,
      setsCount: sets.length,
    });
  }

  // Enrich sets with catalog summary
  if (sets.length) {
    sets = await enrichSets(sets, 30);
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets.minifig.enriched', {
      inputPart: part,
      bricklinkFigId,
      setsCount: sets.length,
      usedLocal: sets.some(
        s => s.numParts != null || s.themeName != null || s.year !== 0
      ),
    });
  }

  return {
    part: {
      partNum: bricklinkFigId,
      name: displayName,
      imageUrl: null,
      confidence: 0,
      colorId: null,
      colorName: null,
      isMinifig: true,
      bricklinkFigId,
    },
    availableColors: [],
    selectedColorId: null,
    sets: ensureSetNames(sets),
  };
}

/**
 * Check if a part ID looks like a BrickLink minifig ID (e.g., "sw0001").
 */
export function looksLikeBricklinkFig(part: string): boolean {
  return /^[a-z]{2,3}\d{3,}$/i.test(part.trim());
}
