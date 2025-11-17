'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { IdentifyResultCard } from '@/app/components/identify/IdentifyResultCard';
import { IdentifySetList } from '@/app/components/identify/IdentifySetList';
import { IdentifyAssemblyList } from '@/app/components/identify/IdentifyAssemblyList';
import type {
	IdentifyCandidate,
	IdentifyPart,
	IdentifyResponse,
	IdentifySet,
} from '@/app/components/identify/types';
import type { RebrickableColor } from '@/app/lib/rebrickable';

export default function IdentifyPage() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [part, setPart] = useState<IdentifyPart | null>(null);
	const [candidates, setCandidates] = useState<IdentifyCandidate[]>([]);
	const [sets, setSets] = useState<IdentifySet[]>([]);
	const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
	const [colors, setColors] = useState<Array<{ id: number; name: string }> | null>(null);
	const [assembly, setAssembly] = useState<
		Array<{
			blPartNo: string;
			name?: string;
			imageUrl?: string | null;
			quantity: number;
			blColorId?: number;
			blColorName?: string;
			rbPartNum?: string;
		}> | null
	>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const onFileChange = useCallback((file: File | null) => {
		if (!file) return;
		setError(null);
		setIsLoading(false);
		setPart(null);
		setCandidates([]);
		setSets([]);
		setSelectedFile(file);
		setSelectedColorId(null);
		// preview
		const url = URL.createObjectURL(file);
		setImagePreview(url);
	}, []);

	const onSearch = useCallback(async () => {
		if (!selectedFile) return;
		setError(null);
		setIsLoading(true);
		try {
			const form = new FormData();
			form.append('image', selectedFile);
			const res = await fetch('/api/identify', { method: 'POST', body: form });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error ?? 'identify_failed');
			}
			const data = (await res.json()) as IdentifyResponse;
			setPart(data.part);
			setCandidates(data.candidates ?? []);
			setSets(data.sets ?? []);
			setAssembly((data.assembly ?? null) as any);
			// Use availableColors from API; auto-select if only one
			const availableColors = (data.availableColors ?? []).filter(c => !!c?.name);
			if (availableColors.length > 0) {
				setColors(availableColors.map(c => ({ id: c.id, name: c.name })));
			} else {
				setColors([]);
			}
			if (typeof data.selectedColorId !== 'undefined') {
				setSelectedColorId(data.selectedColorId ?? null);
			} else if (availableColors.length === 1) {
				setSelectedColorId(availableColors[0]!.id);
			} else {
				setSelectedColorId(null);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setIsLoading(false);
		}
	}, [selectedFile]);

	// Global colors no longer used for Identify; colors come from API per-part
	const loadColors = useCallback(async () => {}, []);

	const onSelectCandidate = useCallback(async (c: IdentifyCandidate) => {
		try {
			setError(null);
			setIsLoading(true);
			// Update displayed part immediately
			setPart((prev) =>
				prev
					? {
							...prev,
							partNum: c.partNum,
							name: c.name,
							imageUrl: c.imageUrl ?? prev.imageUrl,
							confidence: c.confidence,
						}
					: {
							partNum: c.partNum,
							name: c.name,
							imageUrl: c.imageUrl ?? null,
							confidence: c.confidence,
							colorId: null,
							colorName: null,
						}
			);
			// Fetch sets for the candidate (respect selected color if any)
			const url = new URL('/api/identify/sets', window.location.origin);
			url.searchParams.set('part', c.partNum);
			if (selectedColorId != null) url.searchParams.set('colorId', String(selectedColorId));
			const res = await fetch(url.toString(), { cache: 'no-store' });
			if (!res.ok) throw new Error('identify_sets_failed');
			const payload = await res.json();
			// payload.part has authoritative name/image; prefer it
			const payloadAny = (payload as unknown) as {
				part?: { partNum: string; name: string; imageUrl: string | null };
				sets?: IdentifySet[];
				availableColors?: Array<{ id: number; name: string }>;
				selectedColorId?: number | null;
			};
			if (payloadAny.part) {
				setPart((prev) =>
					prev
						? {
								...prev,
								partNum: payloadAny.part!.partNum,
								name: payloadAny.part!.name,
								imageUrl: payloadAny.part!.imageUrl,
						  }
						: (payloadAny.part as IdentifyPart)
				);
			}
			setSets((payloadAny.sets as IdentifySet[]) ?? []);
			if (Array.isArray((payloadAny as any).assembly)) {
				setAssembly((payloadAny as any).assembly);
			} else {
				setAssembly(null);
			}
			if (Array.isArray(payloadAny.availableColors)) {
				const opts = payloadAny.availableColors.filter(c => !!c?.name);
				setColors(opts.map(c => ({ id: c.id, name: c.name })));
			}
			if ('selectedColorId' in payloadAny) {
				setSelectedColorId(payloadAny.selectedColorId ?? null);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setIsLoading(false);
		}
	}, [selectedColorId]);

	const onChangeColor = useCallback(
		async (colorId: number | null) => {
			setSelectedColorId(colorId);
			if (!part) return;
			try {
				setIsLoading(true);
				const url = new URL('/api/identify/sets', window.location.origin);
				url.searchParams.set('part', part.partNum);
				if (colorId != null) url.searchParams.set('colorId', String(colorId));
				const res = await fetch(url.toString(), { cache: 'no-store' });
				if (!res.ok) throw new Error('identify_sets_failed');
				const payload: unknown = await res.json();
				const setsAny = (payload as { sets?: IdentifySet[] }).sets ?? [];
				const avail = (payload as { availableColors?: Array<{ id: number; name: string }> }).availableColors ?? undefined;
				const selected = (payload as { selectedColorId?: number | null }).selectedColorId;
				setSets(setsAny);
				if (Array.isArray(avail)) {
					setColors(avail.filter(c => !!c?.name).map(c => ({ id: c.id, name: c.name })));
				}
				if (typeof selected !== 'undefined') {
					setSelectedColorId(selected ?? null);
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setIsLoading(false);
			}
		},
		[part]
	);

	const colorOptions = useMemo(() => colors ?? [], [colors]);

	const onSelectAssemblyPart = useCallback(
		async (rbPartNum: string | null, blPartNo: string, blColorId?: number | null) => {
			try {
				setError(null);
				setIsLoading(true);
				const partToUse = rbPartNum ?? blPartNo;
				setPart(prev =>
					prev
						? { ...prev, partNum: partToUse }
						: { partNum: partToUse, name: part?.name ?? '', imageUrl: part?.imageUrl ?? null, confidence: 0, colorId: null, colorName: null }
				);
				const url = new URL('/api/identify/sets', window.location.origin);
				url.searchParams.set('part', partToUse);
				if (selectedColorId != null) {
					url.searchParams.set('colorId', String(selectedColorId));
				} else if (typeof blColorId === 'number') {
					url.searchParams.set('blColorId', String(blColorId));
				}
				const res = await fetch(url.toString(), { cache: 'no-store' });
				if (!res.ok) throw new Error('identify_sets_failed');
				const payload: unknown = await res.json();
				const setsAny = (payload as { sets?: IdentifySet[] }).sets ?? [];
				setSets(setsAny);
				const avail = (payload as { availableColors?: Array<{ id: number; name: string }> }).availableColors ?? undefined;
				const selected = (payload as { selectedColorId?: number | null }).selectedColorId;
				if (Array.isArray(avail)) {
					setColors(avail.filter(c => !!c?.name).map(c => ({ id: c.id, name: c.name })));
				}
				if (typeof selected !== 'undefined') {
					setSelectedColorId(selected ?? null);
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setIsLoading(false);
			}
		},
		[part, selectedColorId]
	);

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold">Identify</h1>
			<div className="mt-4">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					capture="environment"
					className="hidden"
					onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
				/>
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="relative block w-full max-w-xs overflow-hidden rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary"
					aria-label="Upload or take a photo"
				>
					<div className="aspect-square w-full p-4">
						{imagePreview ? (
							<div className="h-full w-full overflow-hidden rounded bg-white">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={imagePreview} alt="" className="h-full w-full object-contain" />
							</div>
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-neutral-500">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="currentColor"
									className="h-12 w-12"
									aria-hidden="true"
								>
									<path d="M9 2a1 1 0 0 0-.894.553L7.382 4H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-2.382l-.724-1.447A1 1 0 0 0 14 2H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 .002 6.002A3 3 0 0 0 12 9Z" />
								</svg>
								<div className="text-sm font-medium">Upload or take a photo</div>
								<div className="text-xs text-neutral-500">Supports camera on mobile</div>
							</div>
						)}
					</div>
				</button>
				{selectedFile && !part && (
					<div className="mt-3">
						<button
							type="button"
							onClick={onSearch}
							disabled={isLoading}
							className="rounded border px-3 py-2 text-sm disabled:opacity-50"
						>
							{isLoading ? 'Searching…' : 'Search'}
						</button>
					</div>
				)}
			</div>
			{isLoading && <div className="mt-4 text-sm">Processing…</div>}
			{error && (
				<div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
					Failed to identify image: {error}
				</div>
			)}
			{part && (
				<div className="mt-6">
					<IdentifyResultCard
						part={part}
						candidates={candidates}
						onSelectCandidate={onSelectCandidate}
						colorOptions={colorOptions}
						selectedColorId={selectedColorId}
						onChangeColor={onChangeColor}
					/>
					<IdentifySetList items={sets} />
					{assembly && assembly.length > 0 && (
						<IdentifyAssemblyList
							items={assembly as any}
							onSelectPart={onSelectAssemblyPart}
						/>
					)}
				</div>
			)}
		</div>
	);
}

