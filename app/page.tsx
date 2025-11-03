import { PageLayout } from '@/app/components/layout/PageLayout';
import { TopNav } from '@/app/components/nav/TopNav';
import { SearchBar } from '@/app/components/search/SearchBar';
import { Suspense } from 'react';

export default function Home() {
  return (
    <PageLayout
      topBar={
        <TopNav>
          <div />
          <div className="flex min-w-0 flex-1 justify-center">
            <h1 className="truncate text-base font-semibold">Cobble</h1>
          </div>
          <div />
        </TopNav>
      }
    >
      <section className="mb-8">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8">
          <h1 className="mb-4 text-2xl font-semibold">
            Cobble — LEGO Set Piece Picker
          </h1>
          <p className="mb-4 text-sm text-foreground-muted">
            Search for a set to view pieces.
          </p>
          <Suspense fallback={null}>
            <SearchBar />
          </Suspense>
        </div>
      </section>
    </PageLayout>
  );
}
