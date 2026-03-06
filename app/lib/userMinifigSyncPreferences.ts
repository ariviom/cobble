import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

export type MinifigSyncScope = 'collection' | 'owned';

export type MinifigSyncPreferences = {
  /**
   * When true, automatically sync owned minifigures from owned sets whenever
   * user_sets changes. Wishlist minifigures are never created automatically.
   */
  syncOwnedFromSets: boolean;
  /**
   * Which sets feed the minifig sync:
   * - 'collection' (default): owned sets + sets in any user list
   * - 'owned': only sets marked as owned
   */
  syncScope: MinifigSyncScope;
};

export type SupabaseDbClient = SupabaseClient<Database>;

type UserPreferencesRow =
  Database['public']['Tables']['user_preferences']['Row'];

type UserPreferencesSettings = UserPreferencesRow['settings'];

const VALID_SYNC_SCOPES: ReadonlySet<MinifigSyncScope> = new Set([
  'collection',
  'owned',
]);

const DEFAULT_MINIFIG_SYNC_PREFERENCES: MinifigSyncPreferences = {
  syncOwnedFromSets: true,
  syncScope: 'collection',
};

function extractMinifigSyncFromSettings(
  settings: UserPreferencesSettings
): Partial<MinifigSyncPreferences> | null {
  if (!settings || typeof settings !== 'object') return null;
  const minifigSync = (settings as { minifigSync?: unknown }).minifigSync;
  if (!minifigSync || typeof minifigSync !== 'object') return null;
  const obj = minifigSync as {
    syncOwnedFromSets?: unknown;
    syncScope?: unknown;
  };
  const result: Partial<MinifigSyncPreferences> = {};

  if (typeof obj.syncOwnedFromSets === 'boolean') {
    result.syncOwnedFromSets = obj.syncOwnedFromSets;
  }

  if (
    typeof obj.syncScope === 'string' &&
    VALID_SYNC_SCOPES.has(obj.syncScope as MinifigSyncScope)
  ) {
    result.syncScope = obj.syncScope as MinifigSyncScope;
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
    syncScope: raw.syncScope ?? DEFAULT_MINIFIG_SYNC_PREFERENCES.syncScope,
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
    syncScope:
      patch.syncScope && VALID_SYNC_SCOPES.has(patch.syncScope)
        ? patch.syncScope
        : existingSync.syncScope &&
            VALID_SYNC_SCOPES.has(existingSync.syncScope as MinifigSyncScope)
          ? (existingSync.syncScope as MinifigSyncScope)
          : DEFAULT_MINIFIG_SYNC_PREFERENCES.syncScope,
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
