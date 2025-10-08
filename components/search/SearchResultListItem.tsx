"use client";

import Link from "next/link";
import type { SearchResult } from "./types";

export function SearchResultListItem({ result }: { result: SearchResult }) {
	return (
		<li className="p-2 hover:bg-gray-50">
			<Link href={`/set/${encodeURIComponent(result.setNumber)}`} className="flex justify-between">
				<span>{result.setNumber} — {result.name}</span>
				<span className="text-xs text-gray-500">{result.year}</span>
			</Link>
		</li>
	);
}


