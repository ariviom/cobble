import { AdminShell } from '@/app/components/admin/AdminShell';
import {
  isFeedbackCategory,
  listAdminFeedback,
  type FeedbackCategory,
} from '@/app/lib/services/adminFeedback';

import { FeedbackListClient } from './FeedbackListClient';

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const categoryParam = pickString(resolved, 'category');
  const category: FeedbackCategory | undefined = isFeedbackCategory(
    categoryParam
  )
    ? categoryParam
    : undefined;

  const initial = await listAdminFeedback({
    ...(category !== undefined && { category }),
    page: 0,
    pageSize: 50,
  });

  return (
    <AdminShell activeKey="feedback">
      <FeedbackListClient
        initialData={initial}
        initialCategory={category ?? null}
      />
    </AdminShell>
  );
}
