import { PageLayout } from '@/app/components/layout/PageLayout';
import type { PropsWithChildren } from 'react';

export default function IdentifyLayout({
  children,
}: PropsWithChildren<{ children?: React.ReactNode }>) {
  return <PageLayout>{children}</PageLayout>;
}
