import 'server-only';

import type { User } from '@supabase/supabase-js';
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

export type AdminUserDetail = {
  authUser: User;
  overview: AdminUserRow | null;
  subscription: BillingSubscriptionRow | null;
};

export async function getAdminUserDetail(
  userId: string
): Promise<AdminUserDetail | null> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(userId);

  if (authError || !authData?.user) {
    logger.warn('adminUsers.detail_auth_missing', { userId });
    return null;
  }

  const [{ data: overviewRow }, { data: subRow }] = await Promise.all([
    supabase
      .from('admin_users_overview')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('billing_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    authUser: authData.user,
    overview: (overviewRow as AdminUserRow | null) ?? null,
    subscription: (subRow as BillingSubscriptionRow | null) ?? null,
  };
}
