import { getSetInventory } from '@/app/lib/rebrickable';
import type { InventoryRow } from '@/app/components/set/types';

export async function getSetInventoryRows(
  setNumber: string
): Promise<InventoryRow[]> {
  return getSetInventory(setNumber);
}


