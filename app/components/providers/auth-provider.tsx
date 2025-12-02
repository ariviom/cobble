'use client';

import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

type AuthProviderProps = PropsWithChildren<{
  /**
   * User resolved on the server via Supabase SSR auth.
   * This lets us render the correct auth state on first paint without
   * waiting for a client-side session check.
   */
  initialUser: User | null;
}>;

export function AuthProvider({ initialUser, children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(() => {
    if (initialUser) return initialUser;
    return readCachedUser();
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (initialUser) return false;
    return !readCachedUser();
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const ensureSession = async () => {
      // If we already have a user from SSR or cache, we don't need an
      // additional round-trip just to decide login state.
      if (initialUser || readCachedUser()) {
        setIsLoading(false);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        const nextUser = session?.user ?? null;
        setUser(nextUser);
        writeCachedUser(nextUser);
      } catch {
        if (cancelled) return;
        setUser(null);
        writeCachedUser(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void ensureSession();

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
  }, [initialUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}


