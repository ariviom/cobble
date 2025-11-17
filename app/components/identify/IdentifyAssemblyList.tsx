'use client';

import Image from 'next/image';

export type AssemblyItem = {
	blPartNo: string;
	name?: string;
	imageUrl?: string | null;
	quantity: number;
	blColorId?: number;
	blColorName?: string;
	rbPartNum?: string;
};

export function IdentifyAssemblyList({
	items,
	onSelectPart,
}: {
	items: AssemblyItem[];
	onSelectPart: (rbPartNum: string | null, blPartNo: string, blColorId?: number | null) => void;
}) {
	if (!items?.length) return null;
	return (
		<div className="mt-4 rounded border border-neutral-200 bg-white p-3 dark:bg-background">
			<div className="mb-2 text-sm font-medium">Assembly components</div>
			<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{items.map((it) => (
					<li key={`${it.blPartNo}-${it.blColorId ?? 'x'}`} className="flex items-center gap-3 rounded border p-2">
						<div className="relative h-12 w-12 shrink-0 bg-neutral-50">
							{it.imageUrl ? (
								<Image src={it.imageUrl} alt="" width={48} height={48} className="h-full w-full object-contain" />
							) : null}
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-xs font-medium">{it.name ?? it.blPartNo}</div>
							<div className="text-[11px] text-neutral-500">
								{it.blPartNo}
								{typeof it.quantity === 'number' ? ` • x${it.quantity}` : ''}
								{it.blColorName ? ` • ${it.blColorName}` : ''}
							</div>
						</div>
						<button
							type="button"
							className="rounded border px-2 py-1 text-xs"
							onClick={() => onSelectPart(it.rbPartNum ?? null, it.blPartNo, typeof it.blColorId === 'number' ? it.blColorId : null)}
							title={it.rbPartNum ? `Use ${it.rbPartNum}` : 'Use this BL part'}
						>
							Use
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}


