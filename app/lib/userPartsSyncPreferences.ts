import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

export type PartSyncPreferences = {
  syncFromSets: boolean;
};

export type SupabaseDbClient = SupabaseClient<Database>;

type UserPreferencesRow =
  Database['public']['Tables']['user_preferences']['Row'];

type UserPreferencesSettings = UserPreferencesRow['settings'];

const DEFAULT_PART_SYNC_PREFERENCES: PartSyncPreferences = {
  syncFromSets: true,
};

function extractPartSyncFromSettings(
  settings: UserPreferencesSettings
): Partial<PartSyncPreferences> | null {
  if (!settings || typeof settings !== 'object') return null;
  const partSync = (settings as { partSync?: unknown }).partSync;
  if (!partSync || typeof partSync !== 'object') return null;
  const obj = partSync as { syncFromSets?: unknown };
  if (typeof obj.syncFromSets === 'boolean') {
    return { syncFromSets: obj.syncFromSets };
  }
  return null;
}

export async function loadUserPartsSyncPreferences(
  supabase: SupabaseDbClient,
  userId: string
): Promise<PartSyncPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.warn('loadUserPartsSyncPreferences: failed', {
          userId,
          error: error.message,
        });
      } catch {}
    }
    return DEFAULT_PART_SYNC_PREFERENCES;
  }

  const raw = extractPartSyncFromSettings(data?.settings ?? null);
  if (!raw || typeof raw.syncFromSets !== 'boolean') {
    return DEFAULT_PART_SYNC_PREFERENCES;
  }

  return { syncFromSets: raw.syncFromSets };
}

export async function saveUserPartsSyncPreferences(
  supabase: SupabaseDbClient,
  userId: string,
  patch: Partial<PartSyncPreferences>
): Promise<void> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && process.env.NODE_ENV !== 'production') {
    try {
      console.warn('saveUserPartsSyncPreferences: failed to load existing', {
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
    existingSettings.partSync && typeof existingSettings.partSync === 'object'
      ? (existingSettings.partSync as Partial<PartSyncPreferences>)
      : {};

  const nextSync: PartSyncPreferences = {
    syncFromSets:
      typeof patch.syncFromSets === 'boolean'
        ? patch.syncFromSets
        : typeof existingSync.syncFromSets === 'boolean'
          ? existingSync.syncFromSets
          : DEFAULT_PART_SYNC_PREFERENCES.syncFromSets,
  };

  const nextSettings = { ...existingSettings, partSync: nextSync };

  await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
      settings: nextSettings,
    },
    { onConflict: 'user_id' }
  );
}
