import { SearchBar } from '@/app/components/search/SearchBar';
import { SearchResults } from '@/app/components/search/SearchResults';
import { Suspense } from 'react';

export default function SearchPage() {
  return (
    <>
      <section className="mb-8">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8">
          <h1 className="mb-4 text-2xl font-semibold">Search</h1>
          <Suspense fallback={null}>
            <SearchBar />
          </Suspense>
        </div>
      </section>
      <section>
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8">
          <Suspense fallback={null}>
            <SearchResults />
          </Suspense>
        </div>
      </section>
    </>
  );
}
