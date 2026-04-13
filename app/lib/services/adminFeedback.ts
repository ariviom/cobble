import 'server-only';

import type { Tables } from '@/supabase/types';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export const FEEDBACK_CATEGORIES = [
  'bug',
  'feature_request',
  'question',
  'general',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type AdminFeedbackRow = Tables<'user_feedback'>;

export type ListAdminFeedbackArgs = {
  category?: FeedbackCategory;
  page: number;
  pageSize: number;
};

export type ListAdminFeedbackResult = {
  rows: AdminFeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return (
    typeof value === 'string' &&
    (FEEDBACK_CATEGORIES as readonly string[]).includes(value)
  );
}

export async function listAdminFeedback({
  category,
  page,
  pageSize,
}: ListAdminFeedbackArgs): Promise<ListAdminFeedbackResult> {
  if (category && !isFeedbackCategory(category)) {
    return { rows: [], total: 0, page, pageSize };
  }

  const supabase = getSupabaseServiceRoleClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('user_feedback')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    logger.warn('adminFeedback.list_failed', { message: error.message });
    return { rows: [], total: 0, page, pageSize };
  }

  return {
    rows: (data ?? []) as AdminFeedbackRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
