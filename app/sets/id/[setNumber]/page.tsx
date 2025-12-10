import { LocalDataProviderBoundary } from '@/app/components/providers/LocalDataProviderBoundary';
import { SetPageClient } from '@/app/components/set/SetPageClient';
import { getSetSummaryLocal } from '@/app/lib/catalog';
import { getSetInventoryRowsWithMeta } from '@/app/lib/services/inventory';
import { getSetSummary } from '@/app/lib/rebrickable';
import { notFound } from 'next/navigation';

type RouteParams = {
  setNumber: string;
};

type SetPageProps = {
  params: Promise<RouteParams>;
};

export default async function SetPage({ params }: SetPageProps) {
  const { setNumber } = await params;
  if (!setNumber) notFound();

  // Prefer Supabase-backed catalog summary when available and prefetch inventory in parallel.
  const [summary, inventory] = await Promise.all([
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
      (await getSetSummary(setNumber).catch(() => null)),
    getSetInventoryRowsWithMeta(setNumber).catch(() => null),
  ]);

  if (!summary) notFound();

  return (
    <LocalDataProviderBoundary>
      <SetPageClient
        setNumber={summary.setNumber}
        setName={summary.name}
        year={summary.year}
        imageUrl={summary.imageUrl}
        numParts={summary.numParts}
        themeId={summary.themeId ?? null}
        themeName={summary.themeName ?? null}
        initialInventory={inventory?.rows ?? null}
      />
    </LocalDataProviderBoundary>
  );
}
