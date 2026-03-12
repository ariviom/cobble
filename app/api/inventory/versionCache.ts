import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

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

export async function getInventoryVersion(): Promise<string | null> {
  const now = Date.now();
  const cached = getVersionCache();
  if (cached && now - cached.at < VERSION_CACHE_TTL_MS) {
    return cached.version;
  }

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase
      .from('rb_download_versions')
      .select('version')
      .eq('source', 'inventory_parts')
      .maybeSingle();
    if (error) {
      logger.warn('inventory.version.read_failed', { error: error.message });
      return null;
    }
    const version = (data?.version as string | null | undefined) ?? null;
    setVersionCache({ at: now, version });
    return version;
  } catch (err) {
    logger.warn('inventory.version.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
