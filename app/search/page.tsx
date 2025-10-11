import { SearchBar } from '@/app/components/search/SearchBar';
import { SearchResults } from '@/app/components/search/SearchResults';

export default function SearchPage() {
  return (
    <>
      <section className="mb-8">
        <h1 className="mb-4 text-2xl font-semibold">Search</h1>
        <SearchBar />
      </section>
      <section>
        <SearchResults />
      </section>
    </>
  );
}
