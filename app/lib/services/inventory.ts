import { getSetInventoryLocal } from '@/app/lib/catalog';
import { getSetInventory } from '@/app/lib/rebrickable';
import type { InventoryRow } from '@/app/components/set/types';

export async function getSetInventoryRows(
  setNumber: string
): Promise<InventoryRow[]> {
  // Prefer Supabase-backed catalog inventory when available.
  try {
    const localRows = await getSetInventoryLocal(setNumber);
    if (localRows.length > 0) {
      return localRows;
    }
  } catch (err) {
    console.error('Supabase getSetInventoryLocal failed, falling back to Rebrickable', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to live Rebrickable inventory when Supabase has no rows or errors.
  return getSetInventory(setNumber);
}




