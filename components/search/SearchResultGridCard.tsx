"use client";

import Link from "next/link";
import type { SearchResult } from "./types";

export function SearchResultGridCard({ result }: { result: SearchResult }) {
	return (
		<Link href={`/set/${encodeURIComponent(result.setNumber)}`} className="border rounded p-3 hover:shadow-sm transition-shadow">
			<div className="text-sm font-medium truncate">{result.setNumber} — {result.name}</div>
			<div className="text-xs text-gray-500 mt-1">{result.year}</div>
		</Link>
	);
}


