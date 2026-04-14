'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import type {
  AdminUserRow,
  ListAdminUsersResult,
} from '@/app/lib/services/adminUsers';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TierBadge({ row }: { row: AdminUserRow }) {
  if (row.subscription_tier) {
    return (
      <span className="rounded-full bg-card-muted px-2 py-0.5 text-xs">
        {row.subscription_tier} · {row.subscription_status ?? '—'}
      </span>
    );
  }
  if (row.entitlement_override_tier) {
    return (
      <span className="rounded-full bg-card-muted px-2 py-0.5 text-xs">
        {row.entitlement_override_tier} · override
      </span>
    );
  }
  return <span className="text-foreground-muted">free</span>;
}

export function UsersListClient({
  initialData,
  initialQuery,
}: {
  initialData: ListAdminUsersResult;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [debounced, setDebounced] = useState(initialQuery);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (debounced === initialQuery) return;
    const controller = new AbortController();
    const url = new URL('/api/admin/users', window.location.origin);
    if (debounced) url.searchParams.set('q', debounced);
    url.searchParams.set('page', '0');
    url.searchParams.set('pageSize', String(initialData.pageSize));

    fetch(url.toString(), { signal: controller.signal })
      .then(res =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((next: ListAdminUsersResult) => setData(next))
      .catch(() => {
        // Search failure — keep existing results rather than wiping the UI.
      });

    return () => controller.abort();
  }, [debounced, initialData.pageSize, initialQuery]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.total / data.pageSize)),
    [data.total, data.pageSize]
  );

  function changePage(newPage: number) {
    startTransition(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(newPage));
      if (debounced) url.searchParams.set('q', debounced);
      else url.searchParams.delete('q');
      router.push(url.pathname + url.search);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Users ({data.total})</h2>
        <input
          type="search"
          placeholder="Search by username…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-64 rounded-md border border-subtle bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-subtle">
        <table className="w-full text-sm">
          <thead className="bg-card-muted text-left text-xs tracking-wide text-foreground-muted uppercase">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2 text-right">Owned</th>
              <th className="px-3 py-2 text-right">Tracked</th>
              <th className="px-3 py-2 text-right">Lists</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-foreground-muted"
                >
                  {query ? 'No users match that search.' : 'No users yet.'}
                </td>
              </tr>
            ) : (
              data.rows.map((row: AdminUserRow) => (
                <tr
                  key={row.user_id ?? ''}
                  className="border-t border-subtle hover:bg-card-muted"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="flex flex-col"
                    >
                      <span className="font-medium">
                        {row.display_name ||
                          row.username ||
                          row.email ||
                          row.user_id}
                      </span>
                      {row.username && (
                        <span className="text-xs text-foreground-muted">
                          @{row.username}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {row.email ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    {formatDate(row.last_sign_in_at)}
                  </td>
                  <td className="px-3 py-2">
                    <TierBadge row={row} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.owned_set_count ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.tracked_set_count ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.list_count ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground-muted">
          Page {data.page + 1} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={data.page === 0 || isPending}
            onClick={() => changePage(data.page - 1)}
            className="rounded-md border border-subtle px-3 py-1 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={data.page + 1 >= totalPages || isPending}
            onClick={() => changePage(data.page + 1)}
            className="rounded-md border border-subtle px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
