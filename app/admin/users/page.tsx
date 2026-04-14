import { AdminShell } from '@/app/components/admin/AdminShell';
import { requireAdmin } from '@/app/lib/server/requireAdmin';
import { listAdminUsers } from '@/app/lib/services/adminUsers';

import { UsersListClient } from './UsersListClient';

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const resolved = searchParams ? await searchParams : {};
  const q = pickString(resolved, 'q');
  const pageRaw = Number(pickString(resolved, 'page') ?? '0');
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize = 25;

  const initial = await listAdminUsers({
    ...(q !== undefined && { q }),
    page,
    pageSize,
  });

  return (
    <AdminShell activeKey="users">
      <UsersListClient initialData={initial} initialQuery={q ?? ''} />
    </AdminShell>
  );
}
