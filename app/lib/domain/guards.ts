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
