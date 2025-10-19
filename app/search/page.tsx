import { SearchBar } from '@/app/components/search/SearchBar';
import { SearchResults } from '@/app/components/search/SearchResults';
import { Suspense } from 'react';

export default function SearchPage() {
  return (
    <>
      <section className="mb-8">
        <h1 className="mb-4 text-2xl font-semibold">Search</h1>
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
      </section>
      <section>
        <Suspense fallback={null}>
          <SearchResults />
        </Suspense>
      </section>
    </>
  );
}
