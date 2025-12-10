export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasProperty<K extends string>(
	obj: unknown,
	key: K
): obj is Record<K, unknown> {
	return isRecord(obj) && key in obj;
}

export function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(v => typeof v === 'string');
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function isNumberLike(value: unknown): value is number | string {
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value === 'string') {
		const n = Number(value);
		return Number.isFinite(n);
	}
	return false;
}
