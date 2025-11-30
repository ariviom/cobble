import { getSetInventoryLocal } from '@/app/lib/catalog';
import { getSetInventory } from '@/app/lib/rebrickable';
import {
  mapRebrickableFigToBrickLink,
  mapSetRebrickableFigsToBrickLinkOnDemand,
  normalizeRebrickableFigId,
} from '@/app/lib/minifigMapping.ts';
import type { InventoryRow } from '@/app/components/set/types';

export async function getSetInventoryRows(
  setNumber: string
): Promise<InventoryRow[]> {
  // Prefer Supabase-backed catalog inventory when available.
  let rows: InventoryRow[] = [];
  try {
    const localRows = await getSetInventoryLocal(setNumber);
    if (localRows.length > 0) {
      rows = localRows;
    }
  } catch (err) {
    console.error(
      'Supabase getSetInventoryLocal failed, falling back to Rebrickable',
      {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }

  // Fallback to live Rebrickable inventory when Supabase has no rows or errors.
  if (!rows.length) {
    rows = await getSetInventory(setNumber);
  }

  // Enrich minifigure parent rows with canonical BrickLink IDs when available.
  const figRows = rows.filter(
    row =>
      row.parentCategory === 'Minifigure' &&
      typeof row.partId === 'string' &&
      row.partId.startsWith('fig:')
  );

  if (!figRows.length) {
    return rows;
  }

  const uniqueFigIds = Array.from(
    new Set(
      figRows
        .map(row => row.partId.replace(/^fig:/, '').trim())
        .filter(Boolean)
    )
  );

  if (!uniqueFigIds.length) {
    return rows;
  }

  const setScopedMappings = await mapSetRebrickableFigsToBrickLinkOnDemand(
    setNumber,
    uniqueFigIds
  );

  const byFigId = new Map<string, string | null>();
  const missing: string[] = [];

  for (const figId of uniqueFigIds) {
    const normalized = normalizeRebrickableFigId(figId);
    if (setScopedMappings.has(normalized)) {
      byFigId.set(figId, setScopedMappings.get(normalized) ?? null);
    } else {
      missing.push(figId);
    }
  }

  if (missing.length > 0) {
    const fallbackMappings = await Promise.all(
      missing.map(async figId => {
        const blId = await mapRebrickableFigToBrickLink(figId);
        return { figId, blId };
      })
    );
    for (const { figId, blId } of fallbackMappings) {
      byFigId.set(figId, blId ?? null);
    }
  }

  return rows.map(row => {
    if (
      row.parentCategory === 'Minifigure' &&
      typeof row.partId === 'string' &&
      row.partId.startsWith('fig:')
    ) {
      const cleanId = row.partId.replace(/^fig:/, '').trim();
      const blId = cleanId ? byFigId.get(cleanId) ?? null : null;
      if (blId == null) {
        return { ...row, bricklinkFigId: null };
      }
      return { ...row, bricklinkFigId: blId };
    }
    return row;
  });
}




