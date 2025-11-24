import { SetPageClient } from '@/app/components/set/SetPageClient';
import { getSetSummaryLocal } from '@/app/lib/catalog';
import { getSetSummary } from '@/app/lib/rebrickable';
import { notFound } from 'next/navigation';

type SetPageProps = {
  params: Promise<{ setNumber: string }>;
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
    <SetPageClient
      setNumber={summary.setNumber}
      setName={summary.name}
      year={summary.year}
      imageUrl={summary.imageUrl}
      numParts={summary.numParts}
      themeId={summary.themeId ?? null}
    />
  );
}
