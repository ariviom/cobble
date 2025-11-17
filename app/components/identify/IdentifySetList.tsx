'use client';

import type { IdentifySet } from './types';
import { IdentifySetListItem } from './IdentifySetListItem';

export function IdentifySetList({ items }: { items: IdentifySet[] }) {
	if (!items.length) {
		return (
			<div className="mt-4 text-sm text-foreground-muted">No sets found for this part.</div>
		);
	}
	return (
		<div className="mt-2">
			<div
				data-item-size="md"
				className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
			>
				{items.map((it) => (
					<IdentifySetListItem key={`${it.setNumber}-${it.quantity}`} item={it} />
				))}
			</div>
		</div>
	);
}


