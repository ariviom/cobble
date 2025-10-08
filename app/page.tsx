import Link from "next/link";
import { SearchBar } from "@/components/search/SearchBar";

export default function Home() {
	return (
		<div className="min-h-screen p-8">
			<h1 className="text-2xl font-semibold mb-4">Cobble — LEGO Set Piece Picker</h1>
			<div className="mb-4 text-sm text-gray-600">Search for a set to view pieces.</div>
			<SearchBar />
			<div className="mt-6">
				<Link href="/search" className="text-blue-600 underline text-sm">Open full-screen search</Link>
			</div>
		</div>
	);
}
