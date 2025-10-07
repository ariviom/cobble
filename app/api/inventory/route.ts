import { NextRequest, NextResponse } from "next/server";
import { getSetInventory } from "@/lib/rebrickable";

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const set = searchParams.get("set");
	if (!set) return NextResponse.json({ error: "missing_set" }, { status: 400 });
	try {
		const rows = await getSetInventory(set);
		return NextResponse.json({ rows });
	} catch {
		return NextResponse.json({ error: "inventory_failed" }, { status: 500 });
	}
}


