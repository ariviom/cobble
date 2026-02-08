export type ParsedInventoryKey = {
  partNum: string;
  colorId: number;
  isSpare: boolean;
};

export function parseInventoryKey(key: string): ParsedInventoryKey | null {
  if (key.startsWith('fig:') || key.includes(':parent=')) return null;

  // Handle bl: prefixed keys (unmatched BL subparts)
  if (key.startsWith('bl:')) {
    const rest = key.slice(3);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon === -1) return null;
    const partNum = rest.slice(0, lastColon);
    const colorId = Number(rest.slice(lastColon + 1));
    if (!partNum || !Number.isFinite(colorId)) return null;
    return { partNum, colorId, isSpare: false };
  }

  const [partNum, colorIdRaw] = key.split(':');
  if (!partNum || !colorIdRaw) return null;
  const colorId = Number(colorIdRaw);
  if (!Number.isFinite(colorId)) return null;
  return { partNum, colorId, isSpare: false };
}
