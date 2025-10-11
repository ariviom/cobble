import { SearchBar } from '@/app/components/search/SearchBar';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <section className="mb-8">
        <h1 className="mb-4 text-2xl font-semibold">
          Cobble — LEGO Set Piece Picker
        </h1>
        <p className="mb-4 text-sm text-gray-600">
          Search for a set to view pieces.
        </p>
        <SearchBar />
      </section>
      <section>
        <Link href="/search" className="text-sm text-blue-600 underline">
          Open full-screen search
        </Link>
      </section>
    </>
  );
}
