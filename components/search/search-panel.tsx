"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SearchResult } from "./types";
import { SearchResultListItem } from "./SearchResultListItem";
import { SearchResultGridCard } from "./SearchResultGridCard";

async function fetchSearch(q: string) {
	if (!q) return [] as Array<SearchResult>;
	const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
	if (!res.ok) throw new Error("search_failed");
	const data = (await res.json()) as { results: Array<SearchResult> };
	return data.results;
}

function useDebounce<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return debounced as T;
}

// Deprecated; kept temporarily for compatibility. Use SearchBar + SearchResults instead.
export function SearchPanel() {
    return null;
}


