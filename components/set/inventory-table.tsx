"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOwnedStore } from "@/store/owned";
import { generateRebrickableCsv, type MissingRow } from "@/lib/export/rebrickableCsv";
import { generateBrickLinkCsv } from "@/lib/export/bricklinkCsv";

type Row = {
	setNumber: string;
	partId: string;
	partName: string;
	colorId: number;
	colorName: string;
	quantityRequired: number;
	imageUrl: string | null;
};

type SortKey = "name" | "color" | "required" | "owned" | "missing" | "size";

function parseStudAreaFromName(partName: string): number | null {
	const m = partName.match(/(\d+)\s*[x×]\s*(\d+)/i);
	if (!m) return null;
	const a = Number(m[1]);
	const b = Number(m[2]);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
	return a * b;
}

function deriveCategory(partName: string): string {
	const token = partName.split(/[^A-Za-z]+/, 1)[0] || "Part";
	return token;
}

async function fetchInventory(setNumber: string): Promise<Row[]> {
	const res = await fetch(`/api/inventory?set=${encodeURIComponent(setNumber)}`);
	if (!res.ok) throw new Error("inventory_failed");
	const data = (await res.json()) as { rows: Row[] };
	return data.rows;
}

export function InventoryTable({ setNumber, setName }: { setNumber: string; setName?: string }) {
	const { data, isLoading } = useQuery({
		queryKey: ["inventory", setNumber],
		queryFn: () => fetchInventory(setNumber),
	});
	const parentRef = useRef<HTMLDivElement | null>(null);
    const rows = useMemo(() => data ?? [], [data]);
    const keys = useMemo(() => rows.map((r) => `${r.partId}:${r.colorId}`), [rows]);
    const required = useMemo(() => rows.map((r) => r.quantityRequired), [rows]);

	// UI state
	const [sortKey, setSortKey] = useState<SortKey>("color");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [groupByCategory, setGroupByCategory] = useState<boolean>(false);
	const [view, setView] = useState<"list" | "grid">("list");
	const [containerWidth, setContainerWidth] = useState<number>(0);

const cardWidth = 240; // px
const cardGap = 16; // px
const columns = Math.max(1, view === "grid" ? Math.floor(Math.max(0, containerWidth) / (cardWidth + cardGap)) || 1 : 1);
const rowCount = view === "grid" ? Math.ceil(rows.length / columns) : rows.length;

const rowVirtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => parentRef.current,
		estimateSize: () => (view === "grid" ? 260 : 108),
		overscan: 10,
	});

	const ownedStore = useOwnedStore();

	useEffect(() => {
		// warm localStorage read
		keys.forEach((k) => ownedStore.getOwned(setNumber, k));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [setNumber, keys.join(",")]);

useEffect(() => {
	const el = parentRef.current;
	if (!el) return;
	const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
	ro.observe(el);
	setContainerWidth(el.clientWidth);
	return () => ro.disconnect();
}, []);

	// Do not early-return to preserve hooks order

const totalMissing = rows.reduce((acc, r, idx) => {
		const k = keys[idx];
		const own = ownedStore.getOwned(setNumber, k);
		return acc + Math.max(0, r.quantityRequired - own);
	}, 0);

const sizeByIndex = useMemo(() => rows.map((r) => parseStudAreaFromName(r.partName) ?? -1), [rows]);
const categoryByIndex = useMemo(() => rows.map((r) => deriveCategory(r.partName)), [rows]);

const sortedIndices = useMemo(() => {
	const idxs = rows.map((_, i) => i);
	function cmp(a: number, b: number): number {
		const ra = rows[a]!;
		const rb = rows[b]!;
		const ka = keys[a]!;
		const kb = keys[b]!;
		const ownedA = ownedStore.getOwned(setNumber, ka);
		const ownedB = ownedStore.getOwned(setNumber, kb);
		const missA = Math.max(0, ra.quantityRequired - ownedA);
		const missB = Math.max(0, rb.quantityRequired - ownedB);
		let base = 0;
		switch (sortKey) {
			case "name": base = ra.partName.localeCompare(rb.partName); break;
			case "color": base = ra.colorName.localeCompare(rb.colorName); break;
			case "required": base = ra.quantityRequired - rb.quantityRequired; break;
			case "owned": base = ownedA - ownedB; break;
			case "missing": base = missA - missB; break;
			case "size": {
				const sa = sizeByIndex[a]!;
				const sb = sizeByIndex[b]!;
				base = sa - sb; break;
			}
		}
		if (base === 0 && groupByCategory) base = ra.partName.localeCompare(rb.partName);
		return sortDir === "asc" ? base : -base;
	}
	if (groupByCategory) {
		idxs.sort((a, b) => {
			const ca = categoryByIndex[a]!;
			const cb = categoryByIndex[b]!;
			if (ca !== cb) return ca.localeCompare(cb);
			return cmp(a, b);
		});
	} else {
		idxs.sort(cmp);
	}
	return idxs;
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [rows, keys.join(","), sortKey, sortDir, groupByCategory, sizeByIndex.join(","), categoryByIndex.join(","), setNumber]);

	function computeMissingRows(): MissingRow[] {
		const result: MissingRow[] = [];
		for (let ix = 0; ix < sortedIndices.length; ix++) {
			const i = sortedIndices[ix]!;
			const r = rows[i]!;
			const k = keys[i]!;
			const own = ownedStore.getOwned(setNumber, k);
			const missing = Math.max(0, r.quantityRequired - own);
			if (missing > 0) {
				result.push({ setNumber, partId: r.partId, colorId: r.colorId, quantityMissing: missing });
			}
		}
		return result;
	}

	function downloadCsv(filename: string, csv: string) {
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div>
			<div className="flex items-center gap-2 mb-2">
				<button
					className="border rounded px-3 py-1"
					onClick={() => ownedStore.markAllAsOwned(setNumber, keys, required)}
				>
					All owned
				</button>
				<button className="border rounded px-3 py-1" onClick={() => ownedStore.clearAll(setNumber)}>
					None owned
				</button>
				<div className="hidden md:flex items-center gap-2">
					<div className="ml-2">
						<label className="text-xs mr-1">View</label>
						<select className="border rounded px-2 py-1 text-sm" value={view} onChange={(e) => setView(e.target.value as any)}>
							<option value="list">List</option>
							<option value="grid">Grid</option>
						</select>
					</div>
					<div>
						<label className="text-xs mr-1">Sort</label>
						<select className="border rounded px-2 py-1 text-sm" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
							<option value="color">Color</option>
							<option value="name">Name</option>
							<option value="required">Required</option>
							<option value="owned">Owned</option>
							<option value="missing">Missing</option>
							<option value="size">Size</option>
						</select>
					</div>
					<button className="border rounded px-2 py-1 text-sm" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
						{sortDir === "asc" ? "Asc" : "Desc"}
					</button>
					<label className="flex items-center gap-1 text-sm ml-1">
						<input type="checkbox" checked={groupByCategory} onChange={(e) => setGroupByCategory(e.target.checked)} />
						Group by category
					</label>
				</div>
				<div className="ml-4 flex items-center gap-2">
					<button
						className="border rounded px-3 py-1"
						onClick={() => {
							const missingRows = computeMissingRows();
							const csv = generateRebrickableCsv(missingRows);
							downloadCsv(`${setNumber}_missing_rebrickable.csv`, csv);
						}}
					>
						Export Rebrickable CSV
					</button>
					<button
						className="border rounded px-3 py-1"
						onClick={() => {
							const missingRows = computeMissingRows();
							const wantedName = setName ? `${setNumber} — ${setName} — mvp` : `${setNumber} — mvp`;
							const { csv, unmapped } = generateBrickLinkCsv(missingRows, { wantedListName: wantedName, condition: "U" });
							if (unmapped.length > 0) {
								// Basic notification for now
								alert(`Note: ${unmapped.length} rows could not be mapped to BrickLink colors and were skipped.`);
							}
							downloadCsv(`${setNumber}_missing_bricklink.csv`, csv);
						}}
					>
						Export BrickLink CSV
					</button>
				</div>
				<div className="ml-auto text-sm text-gray-700">Total missing: {totalMissing}</div>
			</div>
			<div className="border rounded overflow-hidden h-full flex flex-col min-h-0">
				<div className="grid grid-cols-[112px_1fr_140px_200px_180px_160px] font-medium bg-gray-50 px-2 py-2 text-sm sticky top-0 z-10">
					<div>Image</div>
					<div>Part / Color</div>
					<div className="text-right">Qty Required</div>
					<div className="text-right">Qty Owned</div>
					<div className="text-right">Qty Missing</div>
					<div className="text-right">Actions</div>
				</div>
				<div ref={parentRef} style={{ height: "100%", overflow: "auto" }}>
					{rows.length === 0 || isLoading ? (
						<div className="p-4 text-sm text-gray-600">{isLoading ? "Loading…" : "No inventory found."}</div>
					) : (
						<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								if (view === "grid") {
									const columns = Math.max(1, Math.floor(Math.max(0, containerWidth) / (240 + 16)) || 1);
									const start = virtualRow.index * columns;
									const end = Math.min(start + columns, rows.length);
									return (
										<div key={`grid-row-${virtualRow.index}`} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }} className="px-2 py-2">
											<div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16 }}>
												{Array.from({ length: end - start }).map((_, i) => {
													const originalIndex = sortedIndices[start + i]!;
													const r = rows[originalIndex]!;
													const key = keys[originalIndex]!;
													const owned = ownedStore.getOwned(setNumber, key);
													const missing = Math.max(0, r.quantityRequired - owned);
													return (
														<div key={`${key}`} className="border rounded p-2 flex flex-col gap-2">
															<div className="h-40 w-full bg-gray-100 rounded overflow-hidden flex items-center justify-center">
																{r.imageUrl ? (
																	// eslint-disable-next-line @next/next/no-img-element
																	<img src={r.imageUrl} alt="" className="h-full w-full object-contain" />
																) : (
																	<div className="text-xs text-gray-400">no img</div>
																)}
															</div>
															<div className="truncate text-sm">{r.partName}</div>
															<div className="text-xs text-gray-500">{r.partId} · {r.colorName}</div>
															<div className="flex items-center justify-between text-sm">
																<span className="tabular-nums">Req {r.quantityRequired}</span>
																<span className="tabular-nums">Miss {missing}</span>
															</div>
															<div className="flex items-center justify-between">
																<input type="number" className="w-24 border rounded px-2 py-1 text-right" value={owned} onChange={(e) => {
																	const next = Math.min(r.quantityRequired, Math.max(0, Number(e.target.value)) || 0);
																	ownedStore.setOwned(setNumber, key, next);
																}} min={0} max={r.quantityRequired} />
																<button className={owned >= r.quantityRequired ? "bg-slate-200 border rounded px-3 py-1" : "bg-emerald-600 text-white border rounded px-3 py-1"} onClick={() => {
																	const allOwned = owned >= r.quantityRequired;
																	ownedStore.setOwned(setNumber, key, allOwned ? 0 : r.quantityRequired);
																}}>
																{owned >= r.quantityRequired ? "None" : "All"}
																</button>
															</div>
														</div>
												);
											})}
										</div>
									</div>
							);
						}
						// list view
						const originalIndex = sortedIndices[virtualRow.index]!;
						const r = rows[originalIndex]!;
						const key = keys[originalIndex]!;
						const owned = ownedStore.getOwned(setNumber, key);
						const missing = Math.max(0, r.quantityRequired - owned);
						const category = categoryByIndex[originalIndex]!;
						const showGroupHeader = groupByCategory && (virtualRow.index === 0 || categoryByIndex[sortedIndices[virtualRow.index - 1]!] !== category);
						return (
							<div
								key={`${key}:${virtualRow.index}`}
								className="grid grid-cols-[112px_1fr_140px_200px_180px_160px] items-center px-2 border-b"
								style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
							>
								{showGroupHeader && (
									<div className="col-span-6 text-xs font-semibold text-gray-600 py-1">{category}</div>
								)}
								<div className="h-24 w-24 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
									{r.imageUrl ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={r.imageUrl} alt="" className="h-full w-full object-contain" />
									) : (
										<div className="text-xs text-gray-400">no img</div>
									)}
								</div>
								<div className="truncate">
									<div className="truncate text-sm">{r.partName}</div>
									<div className="truncate text-xs text-gray-500">{r.partId} · {r.colorName}</div>
								</div>
								<div className="text-right tabular-nums">{r.quantityRequired}</div>
								<div className="text-right">
									<input
										type="number"
										className="w-28 border rounded px-2 py-1 text-right"
										value={owned}
										onChange={(e) => {
											const next = Math.min(r.quantityRequired, Math.max(0, Number(e.target.value)) || 0);
											ownedStore.setOwned(setNumber, key, next);
										}}
										min={0}
										max={r.quantityRequired}
									/>
								</div>
								<div className="text-right tabular-nums">{missing}</div>
								<div className="text-right">
									<button
										className={owned >= r.quantityRequired ? "bg-slate-200 border rounded px-3 py-1" : "bg-emerald-600 text-white border rounded px-3 py-1"}
										onClick={() => {
											const allOwned = owned >= r.quantityRequired;
											ownedStore.setOwned(setNumber, key, allOwned ? 0 : r.quantityRequired);
										}}
										aria-label={owned >= r.quantityRequired ? "Mark none as owned" : "Mark all as owned"}
									>
										{owned >= r.quantityRequired ? "None" : "All"}
									</button>
								</div>
							</div>
						);
						})}
					</div>
					)}
				</div>
			</div>
		</div>
	);
}
