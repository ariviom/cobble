import 'server-only';

export class ExternalCallBudget {
	constructor(private remaining: number) {}

	tryConsume(cost = 1): boolean {
		if (this.remaining < cost) {
			return false;
		}
		this.remaining -= cost;
		return true;
	}
}

export function withBudget<T>(budget: ExternalCallBudget, cb: () => Promise<T>): Promise<T> {
	if (!budget.tryConsume()) {
		throw new Error('external_budget_exhausted');
	}
	return cb();
}

export function isBudgetError(err: unknown): err is Error {
	return err instanceof Error && err.message === 'external_budget_exhausted';
}

export type BLAvailableColor = { id: number; name: string };

export type BLSet = {
	setNumber: string;
	name: string;
	year: number;
	imageUrl: string | null;
	quantity: number;
	numParts?: number | null;
	themeId?: number | null;
	themeName?: string | null;
};

export type BLFallbackResult = {
	sets: BLSet[];
	partName: string;
	partImage: string | null;
	blAvailableColors: BLAvailableColor[];
};
