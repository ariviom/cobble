import { toCsv } from "@/lib/export/csv";
import type { MissingRow } from "@/lib/export/rebrickableCsv";
import { mapToBrickLink } from "@/lib/mappings/rebrickableToBricklink";

export type BrickLinkOptions = {
	wantedListName: string;
	condition?: "N" | "U";
};

// BrickLink wanted list CSV typical headers:
// Create a typical subset: Item Type,Item No,Color,Quantity,Condition,Description,Comments,Extra,Image,Minimum Price,Maximum Price,Tier Quantity1,Tier Price1, ... (we'll use essentials)
// We'll include wanted list name in Description for portability if importer doesn't accept a separate name field.

export function generateBrickLinkCsv(rows: MissingRow[], opts: BrickLinkOptions): { csv: string; unmapped: MissingRow[] } {
	const filtered = rows.filter((r) => r.quantityMissing > 0);
	const headers = [
		"Item Type",
		"Item No",
		"Color",
		"Quantity",
		"Condition",
		"Description",
	];
	const body: Array<Array<string | number>> = [];
	const unmapped: MissingRow[] = [];
	for (const r of filtered) {
		const mapped = mapToBrickLink(r.partId, r.colorId);
		if (!mapped) {
			unmapped.push(r);
			continue;
		}
		body.push([
			"P", // Item Type: Part
			mapped.itemNo,
			mapped.colorId,
			r.quantityMissing,
			opts.condition ?? "U",
			`${opts.wantedListName}`,
		]);
	}
	return { csv: toCsv(headers, body, /* includeBom */ true), unmapped };
}


