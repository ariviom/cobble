import { SearchBar } from '@/app/components/search/SearchBar';
import { SearchResults } from '@/app/components/search/SearchResults';
import { Suspense } from 'react';

export default function SearchPage() {
  return (
    <>
      <section className="mt-8 mb-4">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="mb-4 text-center text-4xl font-semibold">Search</h1>
          <Suspense fallback={null}>
            <SearchBar />
          </Suspense>
        </div>
      </section>
      <section>
        <div className="mx-auto w-full max-w-6xl">
          <Suspense fallback={null}>
            <SearchResults />
          </Suspense>
        </div>
      </section>
    </>
  );
}
