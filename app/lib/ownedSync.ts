import { enqueueOwnedChange, isIndexedDBAvailable } from '@/app/lib/localDb';

export {
  parseInventoryKey,
  type ParsedInventoryKey,
} from '@/app/lib/domain/inventoryKey';
import { parseInventoryKey } from '@/app/lib/domain/inventoryKey';

export async function enqueueOwnedChangeIfPossible(options: {
  enableCloudSync: boolean;
  userId: string | null;
  clientId: string;
  setNumber: string;
  key: string;
  quantity: number;
}): Promise<void> {
  const { enableCloudSync, userId, clientId, setNumber, key, quantity } =
    options;
  if (!enableCloudSync || !userId) return;
  if (!isIndexedDBAvailable()) return;

  const parsed = parseInventoryKey(key);
  if (!parsed) return;

  await enqueueOwnedChange(
    userId,
    clientId,
    setNumber,
    parsed.partNum,
    parsed.colorId,
    parsed.isSpare,
    quantity
  );
}
