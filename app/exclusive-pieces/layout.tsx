import { PageLayout } from '@/app/components/layout/PageLayout';
import type { PropsWithChildren } from 'react';

export default function ExclusivePiecesLayout({
  children,
}: PropsWithChildren<{ children?: React.ReactNode }>) {
  return <PageLayout>{children}</PageLayout>;
}
