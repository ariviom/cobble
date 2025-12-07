import { LocalDataProviderBoundary } from '@/app/components/providers/LocalDataProviderBoundary';
import { SetPageClient } from '@/app/components/set/SetPageClient';
import { getSetSummaryLocal } from '@/app/lib/catalog';
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

  // Prefer Supabase-backed catalog summary when available.
  const summary =
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
    (await getSetSummary(setNumber).catch(() => null));

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
      />
    </LocalDataProviderBoundary>
  );
}
