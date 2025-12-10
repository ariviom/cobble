import { getThemesLocal } from '@/app/lib/catalog';
import { getThemes } from '@/app/lib/rebrickable';

export async function fetchThemes() {
  try {
    return await getThemesLocal();
  } catch (err) {
    console.error('fetchThemes: Supabase themes failed, falling back', err);
    return getThemes();
  }
}
