import { PageLayout } from '@/app/components/layout/PageLayout';
import { TopNav } from '@/app/components/nav/TopNav';
import type { PropsWithChildren } from 'react';

export default function SearchLayout({
  children,
}: PropsWithChildren<{ children?: React.ReactNode }>) {
  return (
    <PageLayout
      topBar={
        <TopNav>
          <div className="flex min-w-0 flex-1 justify-center">
            <h1 className="truncate text-base font-semibold">Search</h1>
          </div>
        </TopNav>
      }
      contentClassName="mt-2"
    >
      {children}
    </PageLayout>
  );
}
