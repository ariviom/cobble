"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Link from "next/link";

async function fetchSearch(q: string) {
	if (!q) return [] as Array<{ setNumber: string; name: string; year: number }>;
	const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
	if (!res.ok) throw new Error("search_failed");
	const data = (await res.json()) as { results: Array<{ setNumber: string; name: string; year: number }> };
	return data.results;
}

export function SetSearch() {
	const [q, setQ] = useState("");
	const debounced = useDebounce(q, 250);
	const { data, isLoading } = useQuery({
		queryKey: ["search", debounced],
		queryFn: () => fetchSearch(debounced),
		enabled: debounced.length > 0,
	});

	return (
		<div className="w-full max-w-xl">
			<label className="block text-sm font-medium mb-1" htmlFor="set-search">Search set number</label>
			<input
				id="set-search"
				className="w-full border rounded px-3 py-2"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				placeholder="e.g. 1788, 6989, 21322"
			/>
			{isLoading && <div className="mt-2 text-sm">Loading…</div>}
			{!isLoading && data && data.length > 0 && (
				<ul className="mt-2 border rounded divide-y">
					{data.map((r) => (
						<li key={r.setNumber} className="p-2 hover:bg-gray-50">
							<Link href={`/set/${encodeURIComponent(r.setNumber)}`} className="flex justify-between">
								<span>{r.setNumber} — {r.name}</span>
								<span className="text-xs text-gray-500">{r.year}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function useDebounce<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}


