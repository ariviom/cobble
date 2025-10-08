"use client";

import { Button } from "@/components/ui/Button";
import { clampOwned, computeMissing } from "@/components/set/inventory-utils";

type Props = {
	required: number;
	owned: number;
	onChange: (next: number) => void;
	showMissing?: boolean;
};

export function OwnedQuantityControl({ required, owned, onChange, showMissing = true }: Props) {
	const missing = computeMissing(required, owned);
	return (
		<div className="flex items-center gap-3">
			<Button
				variant="secondary"
				className="w-12 h-12 text-xl"
				onClick={() => onChange(clampOwned(owned - 1, required))}
				disabled={owned <= 0}
				aria-label="Decrease owned"
			>
				–
			</Button>
			<div className="flex flex-col items-center min-w-[96px]">
				<div className="tabular-nums text-sm">{owned} of {required}</div>
				{showMissing && <div className="text-[11px] text-gray-500">Missing {missing}</div>}
			</div>
			<Button
				variant="secondary"
				className="w-12 h-12 text-xl"
				onClick={() => onChange(clampOwned(owned + 1, required))}
				disabled={owned >= required}
				aria-label="Increase owned"
			>
				+
			</Button>
		</div>
	);
}


