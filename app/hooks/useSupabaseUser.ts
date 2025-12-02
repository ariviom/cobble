'use client';

import { useAuth } from '@/app/components/providers/auth-provider';

export function useSupabaseUser() {
  return useAuth();
}
