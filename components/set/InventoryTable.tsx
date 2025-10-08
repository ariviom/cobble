"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOwnedStore } from "@/store/owned";
import { clampOwned, computeMissing, deriveCategory, parseStudAreaFromName } from "./inventory-utils";
import type { InventoryRow } from "./types";
import { InventoryGridItem } from "./items/InventoryGridItem";
import { InventoryListItem } from "./items/InventoryListItem";
import { InventoryControls } from "./InventoryControls";
import { ExportModal } from "./ExportModal";
import { generateRebrickableCsv, type MissingRow } from "@/lib/export/rebrickableCsv";
import { generateBrickLinkCsv } from "@/lib/export/bricklinkCsv";

type Row = InventoryRow;

type SortKey = "name" | "color" | "required" | "owned" | "missing" | "size";


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
    const [exportOpen, setExportOpen] = useState<boolean>(false);

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
        return acc + computeMissing(r.quantityRequired, own);
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
		<>
		<div>
			<InventoryControls
				view={view}
				onChangeView={(v) => setView(v)}
				sortKey={sortKey}
				onChangeSortKey={(k) => setSortKey(k)}
				sortDir={sortDir}
				onToggleSortDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
				groupByCategory={groupByCategory}
				onChangeGroupByCategory={(v) => setGroupByCategory(v)}
				onMarkAllOwned={() => ownedStore.markAllAsOwned(setNumber, keys, required)}
				onClearAllOwned={() => ownedStore.clearAll(setNumber)}
				totalMissing={totalMissing}
                onOpenExport={() => setExportOpen(true)}
			/>
			<div className="border rounded overflow-hidden h-full flex flex-col min-h-0">
				<div className="grid grid-cols-[112px_1fr_280px_160px] font-medium bg-gray-50 px-2 py-2 text-sm sticky top-0 z-10">
					<div>Image</div>
					<div>Part / Color</div>
					<div className="text-right">Quantity</div>
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
                                                    const missing = computeMissing(r.quantityRequired, owned);
                                                    return (
                                                        <InventoryGridItem
                                                            key={key}
                                                            row={r}
                                                            owned={owned}
                                                            missing={missing}
                                                            onOwnedChange={(next) => {
                                                                ownedStore.setOwned(setNumber, key, clampOwned(next, r.quantityRequired));
                                                            }}
                                                            onToggleOwnedAll={() => {
                                                                const allOwned = owned >= r.quantityRequired;
                                                                ownedStore.setOwned(setNumber, key, allOwned ? 0 : r.quantityRequired);
                                                            }}
                                                        />
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
                        const missing = computeMissing(r.quantityRequired, owned);
						const category = categoryByIndex[originalIndex]!;
						const showGroupHeader = groupByCategory && (virtualRow.index === 0 || categoryByIndex[sortedIndices[virtualRow.index - 1]!] !== category);
						return (
							<div
								key={`${key}:${virtualRow.index}`}
								className="grid grid-cols-[112px_1fr_280px_160px] items-center px-2 border-b"
								style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
							>
                                <InventoryListItem
                                    row={r}
                                    owned={owned}
                                    missing={missing}
                                    showGroupHeader={showGroupHeader}
                                    category={category}
                                    onOwnedChange={(next) => {
                                        ownedStore.setOwned(setNumber, key, clampOwned(next, r.quantityRequired));
                                    }}
                                    onToggleOwnedAll={() => {
                                        const allOwned = owned >= r.quantityRequired;
                                        ownedStore.setOwned(setNumber, key, allOwned ? 0 : r.quantityRequired);
                                    }}
                                />
							</div>
						);
						})}
					</div>
					)}
				</div>
			</div>
		</div>
			<ExportModal
				open={exportOpen}
				onClose={() => setExportOpen(false)}
				setNumber={setNumber}
				setName={setName}
				getMissingRows={computeMissingRows}
			/>
		</>
	);
}
