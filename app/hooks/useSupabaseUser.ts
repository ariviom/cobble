'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';

type UseSupabaseUserResult = {
  user: User | null;
  isLoading: boolean;
};

const USER_CACHE_KEY = 'quarry_supabase_user_cache_v1';

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    try {
      window.sessionStorage.removeItem(USER_CACHE_KEY);
    } catch {
      // ignore storage errors
    }
    return null;
  }
}

function writeCachedUser(next: User | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!next) {
      window.sessionStorage.removeItem(USER_CACHE_KEY);
    } else {
      window.sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage errors
  }
}

export function useSupabaseUser(): UseSupabaseUserResult {
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [isLoading, setIsLoading] = useState(() => !readCachedUser());

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const run = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) {
          const nextUser = session?.user ?? null;
          setUser(nextUser);
          writeCachedUser(nextUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          writeCachedUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      writeCachedUser(nextUser);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}



