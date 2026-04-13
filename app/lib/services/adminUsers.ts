import 'server-only';

import type { Database, Tables } from '@/supabase/types';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export type AdminUserRow =
  Database['public']['Views']['admin_users_overview']['Row'];

export type ListAdminUsersArgs = {
  q?: string;
  page: number;
  pageSize: number;
};

export type ListAdminUsersResult = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listAdminUsers({
  q,
  page,
  pageSize,
}: ListAdminUsersArgs): Promise<ListAdminUsersResult> {
  const supabase = getSupabaseServiceRoleClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('admin_users_overview')
    .select('*', { count: 'exact' })
    .order('last_sign_in_at', { ascending: false, nullsFirst: false });

  if (q && q.trim()) {
    const safe = q.trim().replace(/[%_]/g, '\\$&');
    // Username-only prefix search by design — admins can navigate by handle.
    query = query.ilike('username', `${safe}%`);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    logger.warn('adminUsers.list_failed', { message: error.message });
    return { rows: [], total: 0, page, pageSize };
  }

  return {
    rows: (data ?? []) as AdminUserRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// Re-export type for the detail task (Task 6) to consume.
export type BillingSubscriptionRow = Tables<'billing_subscriptions'>;
