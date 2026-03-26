import 'server-only';

import crypto from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/metrics';
import type { Database, Tables } from '@/supabase/types';

type GroupSessionRow = Tables<'group_sessions'>;

export type GroupSessionResult =
  | { kind: 'created' | 'existing'; session: SessionSummary }
  | { kind: 'insert_failed' };

type SessionSummary = {
  id: string;
  slug: string;
  setNumber: string;
  isActive: boolean;
};

const SLUG_ALPHABET = '23456789abcdefghijkmnopqrstuvwxyz';
const SLUG_LENGTH = 6;

function generateSlug(): string {
  const bytes = crypto.randomBytes(SLUG_LENGTH);
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    const index = bytes[i] % SLUG_ALPHABET.length;
    slug += SLUG_ALPHABET[index];
  }
  return slug;
}

function toSummary(row: GroupSessionRow): SessionSummary {
  return {
    id: row.id,
    slug: row.slug,
    setNumber: row.set_num,
    isActive: row.is_active,
  };
}

export async function createGroupSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  setNumber: string
): Promise<GroupSessionResult> {
  // Reuse an existing active session for this host + set
  const { data: existing, error: existingError } = await supabase
    .from('group_sessions')
    .select('*')
    .eq('host_user_id', userId as GroupSessionRow['host_user_id'])
    .eq('set_num', setNumber as GroupSessionRow['set_num'])
    .eq('is_active', true as GroupSessionRow['is_active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    logger.error('group_sessions.create.lookup_failed', {
      setNumber,
      userId,
      error: existingError.message,
    });
  }

  if (existing) {
    return { kind: 'existing', session: toSummary(existing) };
  }

  // Try up to 3 times in case of slug collision
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = generateSlug();

    const { data: created, error: insertError } = await supabase
      .from('group_sessions')
      .insert({
        host_user_id: userId as GroupSessionRow['host_user_id'],
        set_num: setNumber as GroupSessionRow['set_num'],
        slug,
      })
      .select('*')
      .maybeSingle();

    if (!insertError && created) {
      return { kind: 'created', session: toSummary(created) };
    }

    lastError = insertError;

    // If slug collided (unique_violation), try again with a new slug
    if (!insertError || insertError.code !== '23505') {
      break;
    }
  }

  logger.error('group_sessions.create.insert_failed', {
    setNumber,
    userId,
    error:
      lastError instanceof Error
        ? lastError.message
        : JSON.stringify(lastError),
  });

  return { kind: 'insert_failed' };
}
