"use client";

import type { InventoryRow } from "../types";
import { Button } from "@/components/ui/Button";
import { OwnedQuantityControl } from "./OwnedQuantityControl";

type Props = {
	row: InventoryRow;
	owned: number;
	missing: number;
	onOwnedChange: (next: number) => void;
	onToggleOwnedAll: () => void;
	showGroupHeader: boolean;
	category: string;
};

export function InventoryListItem({ row, owned, missing, onOwnedChange, onToggleOwnedAll, showGroupHeader, category }: Props) {
	return (
		<>
			{showGroupHeader && (
				<div className="col-span-6 text-xs font-semibold text-gray-600 py-1">{category}</div>
			)}
			<div className="h-24 w-24 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
				{row.imageUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={row.imageUrl} alt="" className="h-full w-full object-contain" />
				) : (
					<div className="text-xs text-gray-400">no img</div>
				)}
			</div>
			<div className="truncate">
				<div className="truncate text-sm">{row.partName}</div>
				<div className="truncate text-xs text-gray-500">{row.partId} · {row.colorName}</div>
			</div>
			<div className="flex items-center justify-end">
				<OwnedQuantityControl required={row.quantityRequired} owned={owned} onChange={onOwnedChange} />
			</div>
			<div className="text-right">
				<Button variant={owned >= row.quantityRequired ? "secondary" : "primary"} onClick={onToggleOwnedAll} aria-label={owned >= row.quantityRequired ? "Mark none as owned" : "Mark all as owned"}>
					{owned >= row.quantityRequired ? "Have None" : "Have All"}
				</Button>
			</div>
		</>
	);
}


