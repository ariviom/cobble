import { getThemesLocal } from '@/app/lib/catalog';
import { getThemes } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

export async function fetchThemes() {
  try {
    return await getThemesLocal();
  } catch (err) {
    logger.error('themes.fetch_fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return getThemes();
  }
}
