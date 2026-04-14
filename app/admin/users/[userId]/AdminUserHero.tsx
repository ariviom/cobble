import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

import { buildUserHandle } from '@/app/lib/users';
import type {
  AdminUserRow,
  BillingSubscriptionRow,
} from '@/app/lib/services/adminUsers';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function AdminUserHero({
  authUser,
  overview,
  subscription,
}: {
  authUser: User;
  overview: AdminUserRow | null;
  subscription: BillingSubscriptionRow | null;
}) {
  const displayName =
    overview?.display_name ||
    overview?.username ||
    authUser.email ||
    authUser.id;
  const handle = buildUserHandle({
    user_id: authUser.id,
    username: overview?.username ?? null,
  });

  return (
    <section className="mb-6 rounded-lg border border-subtle bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold">{displayName}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-foreground-muted">
            {overview?.username && <span>@{overview.username}</span>}
            {authUser.email && <span>{authUser.email}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-foreground-muted">
            <span>Joined {formatDate(authUser.created_at)}</span>
            <span>Last login {formatDate(authUser.last_sign_in_at)}</span>
          </div>
        </div>

        {overview?.lists_public ? (
          <Link
            href={`/collection/${handle}`}
            className="rounded-md border border-subtle px-3 py-1.5 text-sm hover:bg-card-muted"
          >
            View public collection ↗
          </Link>
        ) : (
          <span className="rounded-md border border-dashed border-subtle px-3 py-1.5 text-xs text-foreground-muted">
            Private collection
          </span>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Owned sets" value={overview?.owned_set_count ?? 0} />
        <Stat label="Tracked sets" value={overview?.tracked_set_count ?? 0} />
        <Stat label="Lists" value={overview?.list_count ?? 0} />
        <Stat
          label="Tier"
          value={
            subscription?.tier
              ? `${subscription.tier} · ${subscription.status ?? '—'}`
              : overview?.entitlement_override_tier
                ? `${overview.entitlement_override_tier} · override`
                : 'free'
          }
        />
      </dl>

      {subscription && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-subtle pt-4 text-xs sm:grid-cols-3">
          <KV
            label="Stripe subscription"
            value={subscription.stripe_subscription_id ?? '—'}
          />
          <KV
            label="Period ends"
            value={formatDate(subscription.current_period_end)}
          />
          <KV
            label="Cancels at period end"
            value={subscription.cancel_at_period_end ? 'yes' : 'no'}
          />
        </dl>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs tracking-wide text-foreground-muted uppercase">
        {label}
      </dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
