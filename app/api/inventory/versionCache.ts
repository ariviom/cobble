export const VERSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cache: { at: number; version: string | null } | null = null;

export function getVersionCache() {
  return cache;
}

export function setVersionCache(
  value: { at: number; version: string | null } | null
) {
  cache = value;
}

/** Reset cache (for testing). */
export function _resetVersionCache(): void {
  cache = null;
}
