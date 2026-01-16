'use client';

import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { Checkbox } from '@/app/components/ui/Checkbox';
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
    <div className="space-y-6">
      {/* Collection Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Your sets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Counts of sets you&apos;ve marked as owned or added to your
            wishlist.
          </p>

          {!isLoggedIn && (
            <Alert variant="info" className="mt-4">
              Sign in to track your sets across devices.
            </Alert>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border-2 border-subtle bg-card-muted p-4">
              <p className="text-label font-semibold tracking-wide text-foreground-muted uppercase">
                Owned
              </p>
              <p className="text-heading-lg mt-1 font-bold text-foreground">
                {ownedCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border-2 border-subtle bg-card-muted p-4">
              <p className="text-label font-semibold tracking-wide text-foreground-muted uppercase">
                Wishlist
              </p>
              <p className="text-heading-lg mt-1 font-bold text-foreground">
                {wishlistCount.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Minifig Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Minifigure sync from owned sets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            When enabled, Brick Party keeps your owned minifigures in sync with
            the sets you&apos;ve marked as owned. Minifigure wishlists are never
            created or updated automatically.
          </p>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-3">
              <Checkbox
                checked={syncOwnedMinifigsFromSets}
                onChange={event =>
                  void handleSaveMinifigSyncPreference(event.target.checked)
                }
                disabled={!isLoggedIn || isSavingMinifigSync}
              />
              <span className="text-body font-medium text-foreground">
                Automatically sync owned set minifigures
              </span>
              {isSavingMinifigSync && (
                <span className="text-body-sm text-foreground-muted">
                  Saving…
                </span>
              )}
            </label>

            {minifigSyncError && (
              <p className="text-body-sm font-medium text-danger">
                {minifigSyncError}
              </p>
            )}
            {minifigSyncMessage && !minifigSyncError && (
              <p className="text-body-sm font-medium text-success">
                {minifigSyncMessage}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* One-time Sync */}
      <Card>
        <CardHeader>
          <CardTitle>One-time sync from owned sets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            This will recompute your owned minifigures from the sets you&apos;ve
            marked as owned. Minifigure quantities will be adjusted to match
            quantities found in those sets.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handleRunMinifigSyncNow()}
              disabled={!isLoggedIn || isRunningMinifigSyncNow}
            >
              {isRunningMinifigSyncNow
                ? 'Syncing…'
                : 'Sync owned set minifigures now'}
            </Button>
            {isRunningMinifigSyncNow && (
              <span className="text-body-sm text-foreground-muted">
                This may take a few seconds.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
