import { PageLayout } from '@/app/components/layout/PageLayout';
import type { PropsWithChildren } from 'react';

export default async function SetLayout({ children }: PropsWithChildren) {
  return <PageLayout>{children}</PageLayout>;
}
