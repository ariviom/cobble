export function clampOwned(value: number, required: number): number {
	const asNumber = Number(value);
	if (!Number.isFinite(asNumber)) return 0;
	return Math.min(required, Math.max(0, asNumber));
}

export function computeMissing(required: number, owned: number): number {
	return Math.max(0, required - owned);
}

export function parseStudAreaFromName(partName: string): number | null {
	const m = partName.match(/(\d+)\s*[x×]\s*(\d+)/i);
	if (!m) return null;
	const a = Number(m[1]);
	const b = Number(m[2]);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
	return a * b;
}

export function deriveCategory(partName: string): string {
	const token = partName.split(/[^A-Za-z]+/, 1)[0] || "Part";
	return token;
}


