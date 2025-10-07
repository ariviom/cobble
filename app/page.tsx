import { SetSearch } from "@/components/search/set-search";

export default function Home() {
	return (
		<div className="min-h-screen p-8">
			<h1 className="text-2xl font-semibold mb-4">Cobble — LEGO Set Piece Picker</h1>
			<SetSearch />
		</div>
	);
}
