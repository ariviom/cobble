import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/search-results";

export default function SearchPage() {
	return (
		<div className="min-h-screen p-8">
			<h1 className="text-2xl font-semibold mb-4">Search</h1>
			<div className="mb-4">
				<SearchBar />
			</div>
			<SearchResults />
		</div>
	);
}


