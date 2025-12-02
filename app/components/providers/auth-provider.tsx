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
  /** Canonical handle for the current user (username or user_id fallback). */
  handle: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_CACHE_KEY = 'brick_party_supabase_user_cache_v1';

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
  /**
   * Canonical handle for the current user, resolved on the server.
   * Used for building URLs like /collection/[handle] without extra round-trips.
   */
  initialHandle: string | null;
}>;

export function AuthProvider({
  initialUser,
  initialHandle,
  children,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(() => {
    if (initialUser) return initialUser;
    return readCachedUser();
  });

  const [handle, setHandle] = useState<string | null>(() => initialHandle ?? null);

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
        const existingUser = initialUser ?? readCachedUser();
        if (existingUser && !initialHandle) {
          // Fallback: when we don't have a server-resolved handle,
          // use user_id so we can still build stable URLs.
          setHandle(existingUser.id);
        }
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
        setHandle(nextUser ? nextUser.id : null);
      } catch {
        if (cancelled) return;
        setUser(null);
        writeCachedUser(null);
        setHandle(null);
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
      // If we have a server-resolved handle (username/user_id), preserve it.
      // Only fall back to user.id when we don't have an initialHandle.
      if (!initialHandle) {
        setHandle(nextUser ? nextUser.id : null);
      } else if (!nextUser) {
        // On logout, clear handle.
        setHandle(null);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [initialHandle, initialUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      handle,
    }),
    [handle, isLoading, user]
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




