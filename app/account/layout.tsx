import { PageLayout } from '@/app/components/layout/PageLayout';
import type { PropsWithChildren } from 'react';

export default function AccountLayout({
  children,
}: PropsWithChildren<{ children?: React.ReactNode }>) {
  return <PageLayout noPadding>{children}</PageLayout>;
}








