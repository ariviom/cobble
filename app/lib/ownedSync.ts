import { enqueueOwnedChange, isIndexedDBAvailable } from '@/app/lib/localDb';

export type ParsedInventoryKey = {
  partNum: string;
  colorId: number;
  isSpare: boolean;
};

export function parseInventoryKey(key: string): ParsedInventoryKey | null {
  if (key.startsWith('fig:') || key.includes(':parent=')) return null;
  const [partNum, colorIdRaw] = key.split(':');
  if (!partNum || !colorIdRaw) return null;
  const colorId = Number(colorIdRaw);
  if (!Number.isFinite(colorId)) return null;
  return { partNum, colorId, isSpare: false };
}

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
    clientId,
    setNumber,
    parsed.partNum,
    parsed.colorId,
    parsed.isSpare,
    quantity
  );
}

