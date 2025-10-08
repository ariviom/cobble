"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import type { SearchResult } from "./types";
import { SearchResultListItem } from "./SearchResultListItem";

async function fetchSearch(q: string) {
	if (!q) return [] as Array<SearchResult>;
	const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
	if (!res.ok) throw new Error("search_failed");
	const data = (await res.json()) as { results: Array<SearchResult> };
	return data.results;
}

export function SearchResults() {
	const params = useSearchParams();
	const q = params.get("q") ?? "";
	const { data, isLoading } = useQuery({
		queryKey: ["search", q],
		queryFn: () => fetchSearch(q),
		enabled: q.length > 0,
	});

	if (!q) return null;
	return (
		<div className="w-full max-w-3xl">
			{isLoading && <div className="mt-2 text-sm">Loading…</div>}
			{!isLoading && data && data.length > 0 && (
				<ul className="mt-2 border rounded divide-y">
					{data.map((r) => (
						<SearchResultListItem key={r.setNumber} result={r} />
					))}
				</ul>
			)}
		</div>
	);
}


