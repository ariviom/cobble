import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';

export async function requireAdmin(): Promise<User> {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') {
    redirect('/');
  }

  return user;
}

export function isAdmin(user: User | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin';
}
