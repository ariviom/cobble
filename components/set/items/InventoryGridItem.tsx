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
};

export function InventoryGridItem({ row, owned, missing, onOwnedChange, onToggleOwnedAll }: Props) {
	return (
		<div className="border rounded p-2 flex flex-col gap-2">
			<div className="h-40 w-full bg-gray-100 rounded overflow-hidden flex items-center justify-center">
				{row.imageUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={row.imageUrl} alt="" className="h-full w-full object-contain" />
				) : (
					<div className="text-xs text-gray-400">no img</div>
				)}
			</div>
			<div className="truncate text-sm">{row.partName}</div>
			<div className="text-xs text-gray-500">{row.partId} · {row.colorName}</div>
			<div className="flex items-center justify-center">
				<OwnedQuantityControl required={row.quantityRequired} owned={owned} onChange={onOwnedChange} />
			</div>
			<div className="flex items-center justify-center">
				<Button variant={owned >= row.quantityRequired ? "secondary" : "primary"} onClick={onToggleOwnedAll}>{owned >= row.quantityRequired ? "have none" : "have all"}</Button>
			</div>
		</div>
	);
}


