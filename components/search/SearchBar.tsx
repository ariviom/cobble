"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SearchBar() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const qParam = searchParams.get("q") ?? "";
	const [q, setQ] = useState<string>(qParam);

	useEffect(() => {
		setQ(qParam);
	}, [qParam]);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		const next = q.trim();
		if (pathname !== "/search") {
			router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
			return;
		}
		const sp = new URLSearchParams(Array.from(searchParams.entries()));
		if (next) sp.set("q", next); else sp.delete("q");
		router.replace(`/search?${sp.toString()}`);
	}

	function onClear() {
		setQ("");
		if (pathname === "/search") {
			router.replace("/search");
		}
	}

	return (
		<form onSubmit={onSubmit} className="w-full max-w-3xl flex items-center gap-2">
			<label className="text-sm font-medium" htmlFor="global-search">Search set</label>
			<input
				id="global-search"
				className="flex-1 border rounded px-3 py-2"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				placeholder="e.g. 1788, 6989, 21322"
			/>
			<button type="button" className="border rounded px-3 py-2" onClick={onClear}>Clear</button>
			<button type="submit" className="border rounded px-3 py-2 bg-blue-600 text-white">Search</button>
		</form>
	);
}


