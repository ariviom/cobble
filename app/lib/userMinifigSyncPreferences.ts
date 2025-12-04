import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

export type MinifigSyncPreferences = {
  /**
   * When true, automatically sync owned minifigures from owned sets whenever
   * user_sets changes. Wishlist minifigures are never created automatically.
   */
  syncOwnedFromSets: boolean;
};

export type SupabaseDbClient = SupabaseClient<Database>;

type UserPreferencesRow =
  Database['public']['Tables']['user_preferences']['Row'];

type UserPreferencesSettings = UserPreferencesRow['settings'];

const DEFAULT_MINIFIG_SYNC_PREFERENCES: MinifigSyncPreferences = {
  syncOwnedFromSets: true,
};

function extractMinifigSyncFromSettings(
  settings: UserPreferencesSettings
): Partial<MinifigSyncPreferences> | null {
  if (!settings || typeof settings !== 'object') return null;
  const minifigSync = (settings as { minifigSync?: unknown }).minifigSync;
  if (!minifigSync || typeof minifigSync !== 'object') return null;
  const obj = minifigSync as { syncOwnedFromSets?: unknown };
  const result: Partial<MinifigSyncPreferences> = {};

  if (typeof obj.syncOwnedFromSets === 'boolean') {
    result.syncOwnedFromSets = obj.syncOwnedFromSets;
  }

  return result;
}

export async function loadUserMinifigSyncPreferences(
  supabase: SupabaseDbClient,
  userId: string
): Promise<MinifigSyncPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.warn('loadUserMinifigSyncPreferences: failed to load', {
          userId,
          error: error.message,
        });
      } catch {}
    }
    return DEFAULT_MINIFIG_SYNC_PREFERENCES;
  }

  const raw = extractMinifigSyncFromSettings(data?.settings ?? null);
  if (!raw || typeof raw.syncOwnedFromSets !== 'boolean') {
    return DEFAULT_MINIFIG_SYNC_PREFERENCES;
  }

  return {
    syncOwnedFromSets: raw.syncOwnedFromSets,
  };
}

export async function saveUserMinifigSyncPreferences(
  supabase: SupabaseDbClient,
  userId: string,
  patch: Partial<MinifigSyncPreferences>
): Promise<void> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && process.env.NODE_ENV !== 'production') {
    try {
      console.warn('saveUserMinifigSyncPreferences: failed to load existing', {
        userId,
        error: error.message,
      });
    } catch {}
  }

  const existingSettings =
    data?.settings && typeof data.settings === 'object'
      ? (data.settings as Record<string, unknown>)
      : {};

  const existingSync =
    existingSettings.minifigSync &&
    typeof existingSettings.minifigSync === 'object'
      ? (existingSettings.minifigSync as Partial<MinifigSyncPreferences>)
      : {};

  const nextSync: MinifigSyncPreferences = {
    syncOwnedFromSets:
      typeof patch.syncOwnedFromSets === 'boolean'
        ? patch.syncOwnedFromSets
        : typeof existingSync.syncOwnedFromSets === 'boolean'
          ? existingSync.syncOwnedFromSets
          : DEFAULT_MINIFIG_SYNC_PREFERENCES.syncOwnedFromSets,
  };

  const nextSettings = {
    ...existingSettings,
    minifigSync: nextSync,
  };

  await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
      settings: nextSettings,
    },
    { onConflict: 'user_id' }
  );
}




