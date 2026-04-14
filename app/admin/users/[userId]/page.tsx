import { notFound } from 'next/navigation';

import { AdminShell } from '@/app/components/admin/AdminShell';
import { PublicUserCollectionOverview } from '@/app/components/user/PublicUserCollectionOverview';
import { requireAdmin } from '@/app/lib/server/requireAdmin';
import { getAdminUserDetail } from '@/app/lib/services/adminUsers';
import { fetchPublicCollectionPayload } from '@/app/lib/services/publicCollection';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { fetchThemes } from '@/app/lib/services/themes';

import { AdminUserHero } from './AdminUserHero';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();

  const { userId } = await params;
  const detail = await getAdminUserDetail(userId);

  if (!detail) {
    notFound();
  }

  const serviceClient = getSupabaseServiceRoleClient();
  const [payload, themes] = await Promise.all([
    fetchPublicCollectionPayload(userId, {
      supabase: serviceClient,
      catalogClient: serviceClient,
      includePrivate: true,
    }),
    fetchThemes().catch(() => []),
  ]);

  return (
    <AdminShell activeKey="users">
      <AdminUserHero
        authUser={detail.authUser}
        overview={detail.overview}
        subscription={detail.subscription}
      />
      <PublicUserCollectionOverview
        allSets={payload.allSets}
        allMinifigs={payload.allMinifigs}
        allParts={payload.allParts}
        lists={payload.lists}
        initialThemes={themes}
        initialView="all"
        initialType="sets"
      />
    </AdminShell>
  );
}
