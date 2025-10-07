import { NextRequest, NextResponse } from "next/server";
import { searchSets } from "@/lib/rebrickable";

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const q = searchParams.get("q") ?? "";
	try {
		const results = await searchSets(q);
		return NextResponse.json({ results });
	} catch {
		return NextResponse.json({ error: "search_failed" }, { status: 500 });
	}
}


