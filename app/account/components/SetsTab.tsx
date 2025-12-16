'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/app/components/ui/Card';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  saveUserMinifigSyncPreferences,
  type MinifigSyncPreferences,
} from '@/app/lib/userMinifigSyncPreferences';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { User } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';

type SetsTabProps = {
  user: User | null;
  initialSyncOwnedMinifigsFromSets: boolean;
};

export function SetsTab({
  user,
  initialSyncOwnedMinifigsFromSets,
}: SetsTabProps) {
  const isLoggedIn = !!user;

  // Collection stats
  const userSets = useUserSetsStore(state => state.sets);
  const ownedCount = useMemo(
    () =>
      Object.values(userSets).reduce(
        (acc, set) => (set.status.owned ? acc + 1 : acc),
        0
      ),
    [userSets]
  );
  const wishlistCount = useMemo(
    () =>
      Object.values(userSets).reduce(
        (acc, set) => (set.status.wantToBuild ? acc + 1 : acc),
        0
      ),
    [userSets]
  );

  // Minifig sync state
  const [syncOwnedMinifigsFromSets, setSyncOwnedMinifigsFromSets] =
    useState<boolean>(initialSyncOwnedMinifigsFromSets ?? true);
  const [isSavingMinifigSync, setIsSavingMinifigSync] = useState(false);
  const [isRunningMinifigSyncNow, setIsRunningMinifigSyncNow] = useState(false);
  const [minifigSyncError, setMinifigSyncError] = useState<string | null>(null);
  const [minifigSyncMessage, setMinifigSyncMessage] = useState<string | null>(
    null
  );

  const handleSaveMinifigSyncPreference = async (next: boolean) => {
    if (!user) {
      setMinifigSyncError('Sign in to change minifigure sync settings.');
      return;
    }

    setIsSavingMinifigSync(true);
    setMinifigSyncError(null);
    setMinifigSyncMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const patch: Partial<MinifigSyncPreferences> = {
        syncOwnedFromSets: next,
      };
      await saveUserMinifigSyncPreferences(supabase, user.id, patch);
      setSyncOwnedMinifigsFromSets(next);
      setMinifigSyncMessage('Minifigure sync preference saved.');
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.error('AccountPage: failed to save minifig sync prefs', {
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {}
      }
      setMinifigSyncError('Failed to save minifigure sync preference.');
    } finally {
      setIsSavingMinifigSync(false);
    }
  };

  const handleRunMinifigSyncNow = async () => {
    if (!user) {
      setMinifigSyncError('Sign in to sync minifigures from sets.');
      return;
    }

    const confirmed = window.confirm(
      'This will recompute your owned minifigures from your currently-owned sets. Minifigure quantities will be adjusted to match quantities in those sets. Continue?'
    );
    if (!confirmed) return;

    setIsRunningMinifigSyncNow(true);
    setMinifigSyncError(null);
    setMinifigSyncMessage(null);

    try {
      const res = await fetch('/api/user/minifigs/sync-from-sets?force=1', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        updated?: number;
      } | null;

      if (!res.ok || !data?.ok) {
        setMinifigSyncError('Sync failed. Please try again in a moment.');
        return;
      }

      const updatedCount =
        typeof data.updated === 'number' && Number.isFinite(data.updated)
          ? data.updated
          : 0;
      setMinifigSyncMessage(
        updatedCount > 0
          ? `Synced owned minifigures from sets (updated ${updatedCount.toLocaleString()} records).`
          : 'Synced owned minifigures from sets (no changes needed).'
      );
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.error('AccountPage: manual minifig sync failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {}
      }
      setMinifigSyncError('Sync failed. Please try again.');
    } finally {
      setIsRunningMinifigSyncNow(false);
    }
  };

  return (
    <Card
      id="account-sets-section"
      aria-labelledby="account-sets-heading"
      className="border-none bg-transparent p-0 shadow-none"
    >
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle
              id="account-sets-heading"
              className="text-xl font-semibold text-foreground"
            >
              Your sets
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-foreground-muted">
              Counts of sets you&apos;ve marked as owned or added to your
              wishlist.
            </CardDescription>
          </div>
        </div>

        {!isLoggedIn && (
          <p className="mt-1 text-xs text-foreground-muted">
            Sign in to track your sets across devices.
          </p>
        )}
        <div className="mt-4 space-y-3 border-t border-subtle pt-4">
          <div className="rounded-md border border-subtle bg-card-muted px-3 py-2">
            <p className="text-[11px] tracking-wide text-foreground-muted uppercase">
              Owned
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {ownedCount.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md border border-subtle bg-card-muted px-3 py-2">
            <p className="text-[11px] tracking-wide text-foreground-muted uppercase">
              Wishlist
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {wishlistCount.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4 border-t border-subtle pt-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Minifigure sync from owned sets
            </h3>
            <p className="mt-1 text-xs text-foreground-muted">
              When enabled, Brick Party keeps your{' '}
              <span className="font-medium">owned</span> minifigures in sync
              with the sets you&apos;ve marked as owned. Minifigure wishlists
              are never created or updated automatically.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-theme-primary"
                  checked={syncOwnedMinifigsFromSets}
                  onChange={event =>
                    void handleSaveMinifigSyncPreference(event.target.checked)
                  }
                  disabled={!isLoggedIn || isSavingMinifigSync}
                />
                <span>Automatically sync owned set minifigures</span>
              </label>
              {isSavingMinifigSync && (
                <span className="text-[11px] text-foreground-muted">
                  Saving…
                </span>
              )}
            </div>
            {minifigSyncError && (
              <p className="mt-1 text-[11px] text-brand-red">
                {minifigSyncError}
              </p>
            )}
            {minifigSyncMessage && !minifigSyncError && (
              <p className="mt-1 text-[11px] text-emerald-600">
                {minifigSyncMessage}
              </p>
            )}
          </div>

          <div className="rounded-md border border-subtle bg-card px-3 py-2 text-xs">
            <p className="font-semibold text-foreground">
              One-time sync from owned sets
            </p>
            <p className="mt-1 text-[11px] text-foreground-muted">
              This will recompute your{' '}
              <span className="font-medium">owned</span> minifigures from the
              sets you&apos;ve marked as owned. Minifigure quantities will be
              adjusted to match quantities found in those sets.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleRunMinifigSyncNow()}
                disabled={!isLoggedIn || isRunningMinifigSyncNow}
                className="inline-flex items-center px-3 py-1.5 text-[11px]"
              >
                {isRunningMinifigSyncNow
                  ? 'Syncing…'
                  : 'Sync owned set minifigures now'}
              </Button>
              {isRunningMinifigSyncNow && (
                <span className="text-[11px] text-foreground-muted">
                  This may take a few seconds.
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
