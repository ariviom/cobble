import type { ReactNode } from 'react';

import { PageLayout } from '@/app/components/layout/PageLayout';
import { requireAdmin } from '@/app/lib/server/requireAdmin';

export const metadata = {
  title: 'Admin | Brick Party',
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  return <PageLayout>{children}</PageLayout>;
}
