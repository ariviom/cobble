"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOwnedStore } from "@/store/owned";

type Row = {
	setNumber: string;
	partId: string;
	partName: string;
	colorId: number;
	colorName: string;
	quantityRequired: number;
	imageUrl: string | null;
};

async function fetchInventory(setNumber: string): Promise<Row[]> {
	const res = await fetch(`/api/inventory?set=${encodeURIComponent(setNumber)}`);
	if (!res.ok) throw new Error("inventory_failed");
	const data = (await res.json()) as { rows: Row[] };
	return data.rows;
}

export function InventoryTable({ setNumber }: { setNumber: string }) {
	const { data, isLoading } = useQuery({
		queryKey: ["inventory", setNumber],
		queryFn: () => fetchInventory(setNumber),
	});
	const parentRef = useRef<HTMLDivElement | null>(null);
    const rows = useMemo(() => data ?? [], [data]);
    const keys = useMemo(() => rows.map((r) => `${r.partId}:${r.colorId}`), [rows]);
    const required = useMemo(() => rows.map((r) => r.quantityRequired), [rows]);

	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 108,
		overscan: 10,
	});

	const ownedStore = useOwnedStore();

	useEffect(() => {
		// warm localStorage read
		keys.forEach((k) => ownedStore.getOwned(setNumber, k));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [setNumber, keys.join(",")]);

	if (isLoading) return <div>Loading…</div>;
	if (!rows.length) return <div>No inventory found.</div>;

	const totalMissing = rows.reduce((acc, r, idx) => {
		const k = keys[idx];
		const own = ownedStore.getOwned(setNumber, k);
		return acc + Math.max(0, r.quantityRequired - own);
	}, 0);

	return (
		<div>
			<div className="flex items-center gap-2 mb-2">
				<button
					className="border rounded px-3 py-1"
					onClick={() => ownedStore.markAllAsOwned(setNumber, keys, required)}
				>
					Mark all as owned
				</button>
				<button className="border rounded px-3 py-1" onClick={() => ownedStore.clearAll(setNumber)}>
					Clear all
				</button>
				<div className="ml-auto text-sm text-gray-700">Total missing: {totalMissing}</div>
			</div>
			<div className="border rounded overflow-hidden">
				<div className="grid grid-cols-[112px_1fr_140px_200px_180px_160px] font-medium bg-gray-50 px-2 py-2 text-sm">
					<div>Image</div>
					<div>Part / Color</div>
					<div className="text-right">Qty Required</div>
					<div className="text-right">Qty Owned</div>
					<div className="text-right">Qty Missing</div>
					<div className="text-right">Actions</div>
				</div>
				<div ref={parentRef} style={{ height: 600, overflow: "auto" }}>
					<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
						{rowVirtualizer.getVirtualItems().map((virtualRow) => {
							const r = rows[virtualRow.index]!;
							const key = keys[virtualRow.index]!;
							const owned = ownedStore.getOwned(setNumber, key);
							const missing = Math.max(0, r.quantityRequired - owned);
							return (
								<div
									key={key}
									className="grid grid-cols-[112px_1fr_140px_200px_180px_160px] items-center px-2 border-b"
									style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
								>
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
											className="border rounded px-3 py-1"
											onClick={() => {
												const allOwned = owned >= r.quantityRequired;
												ownedStore.setOwned(setNumber, key, allOwned ? 0 : r.quantityRequired);
											}}
											aria-label={owned >= r.quantityRequired ? "Mark none as owned" : "Mark all as owned"}
										>
											{owned >= r.quantityRequired ? "Mark none as owned" : "Mark all as owned"}
										</button>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
