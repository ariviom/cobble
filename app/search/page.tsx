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
      {/* Search Header - Bold blue banner */}
      <section className="relative overflow-hidden">
        <div className="bg-brand-blue py-6 lg:py-8">
          <div className="container-default">
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-white lg:text-4xl">
                Search Sets & Minifigs
              </h1>
              <p className="text-base text-white/80 lg:text-lg">
                Find LEGO sets and minifigures by name or number
              </p>
            </div>
            <SearchBar initialQuery={initialQuery} initialType={initialType} />
          </div>

          {/* Decorative stud pattern */}
          <div className="pointer-events-none absolute top-3 right-0 left-0 flex justify-center gap-6 opacity-10">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-full bg-white" />
            ))}
          </div>
        </div>

        {/* Yellow accent strip */}
        <div className="h-1.5 bg-brand-yellow" />
      </section>

      {/* Results */}
      <section className="container-wide py-6 lg:py-8">
        <Suspense fallback={null}>
          <SearchResults />
        </Suspense>
      </section>
    </>
  );
}
