import { SearchBar } from '@/app/components/search/SearchBar';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">
        Cobble — LEGO Set Piece Picker
      </h1>
      <div className="mb-4 text-sm text-gray-600">
        Search for a set to view pieces.
      </div>
      <SearchBar />
      <div className="mt-6">
        <Link href="/search" className="text-sm text-blue-600 underline">
          Open full-screen search
        </Link>
      </div>
    </div>
  );
}
