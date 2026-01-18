import { PageLayout } from '@/app/components/layout/PageLayout';
import type { PropsWithChildren } from 'react';

export default function SetsLayout({ children }: PropsWithChildren) {
  return <PageLayout>{children}</PageLayout>;
}
