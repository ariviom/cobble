function normalizeSetNumber(setNumber: string): string | null {
  const trimmed = setNumber?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function buildFallbackSetImageUrl(setNumber: string): string | null {
  const normalized = normalizeSetNumber(setNumber);
  if (!normalized) {
    return null;
  }
  return `https://cdn.rebrickable.com/media/sets/${normalized}/${normalized}.jpg`;
}

export function resolveSetImageUrl(
  existing: string | null | undefined,
  setNumber: string
): string | null {
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return existing;
  }
  return buildFallbackSetImageUrl(setNumber);
}

