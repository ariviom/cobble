"use client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import type { SortKey } from "./types";

type Props = {
	view: "list" | "grid";
	onChangeView: (v: "list" | "grid") => void;
	sortKey: SortKey;
	onChangeSortKey: (k: SortKey) => void;
	sortDir: "asc" | "desc";
	onToggleSortDir: () => void;
	groupByCategory: boolean;
	onChangeGroupByCategory: (v: boolean) => void;
	onMarkAllOwned: () => void;
	onClearAllOwned: () => void;
	totalMissing: number;
	onOpenExport: () => void;
};

export function InventoryControls({
	view,
	onChangeView,
	sortKey,
	onChangeSortKey,
	sortDir,
	onToggleSortDir,
	groupByCategory,
	onChangeGroupByCategory,
	onMarkAllOwned,
	onClearAllOwned,
	totalMissing,
	onOpenExport,
}: Props) {
	return (
		<div className="flex items-center gap-2 mb-2">
			<Button onClick={onMarkAllOwned}>All owned</Button>
			<Button onClick={onClearAllOwned}>None owned</Button>
            <Button variant="primary" onClick={onOpenExport}>Export</Button>
			<div className="hidden md:flex items-center gap-2">
				<div className="ml-2">
					<label className="text-xs mr-1">View</label>
					<Select value={view} onChange={(e) => onChangeView(e.target.value as any)}>
						<option value="list">List</option>
						<option value="grid">Grid</option>
					</Select>
				</div>
				<div>
					<label className="text-xs mr-1">Sort</label>
					<Select value={sortKey} onChange={(e) => onChangeSortKey(e.target.value as SortKey)}>
						<option value="color">Color</option>
						<option value="name">Name</option>
						<option value="required">Required</option>
						<option value="owned">Owned</option>
						<option value="missing">Missing</option>
						<option value="size">Size</option>
					</Select>
				</div>
				<Button onClick={onToggleSortDir}>{sortDir === "asc" ? "Asc" : "Desc"}</Button>
				<label className="flex items-center gap-1 text-sm ml-1">
					<Checkbox checked={groupByCategory} onChange={(e) => onChangeGroupByCategory(e.target.checked)} />
					Group by category
				</label>
			</div>
			<div className="ml-auto text-sm text-gray-700">Total missing: {totalMissing}</div>
		</div>
	);
}


