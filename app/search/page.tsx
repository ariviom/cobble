import { SearchBar } from '@/app/components/search/SearchBar';
import { SearchResults } from '@/app/components/search/SearchResults';
import { Suspense } from 'react';

type SearchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function extractInitialQuery(
  params: Record<string, string | string[] | undefined>
) {
  const raw = params.q;
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return '';
}

function extractInitialType(
  params: Record<string, string | string[] | undefined>
): 'set' | 'minifig' {
  const raw = params.type;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'minifig') return 'minifig';
  return 'set';
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const initialQuery = extractInitialQuery(resolvedParams);
  const initialType = extractInitialType(resolvedParams);
  return (
    <>
      <section className="mt-8 mb-4">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="mb-4 text-center text-4xl font-semibold">Search</h1>
          <SearchBar initialQuery={initialQuery} initialType={initialType} />
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
