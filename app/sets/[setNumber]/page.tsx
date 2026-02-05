import { SetPageRedirector } from '@/app/components/set/SetPageRedirector';
import { getSetSummaryLocal } from '@/app/lib/catalog';
import { getSetSummary } from '@/app/lib/rebrickable';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type RouteParams = {
  setNumber: string;
};

type SetPageProps = {
  params: Promise<RouteParams>;
};

export async function generateMetadata({
  params,
}: SetPageProps): Promise<Metadata> {
  const { setNumber } = await params;
  if (!setNumber) {
    return { title: 'Set Not Found | Brick Party' };
  }

  const summary =
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
    (await getSetSummary(setNumber).catch(() => null));

  if (!summary) {
    return { title: 'Set Not Found | Brick Party' };
  }

  return {
    title: `${summary.setNumber} ${summary.name} | Brick Party`,
    description: `View the ${summary.numParts} pieces in ${summary.name} (${summary.setNumber}) and track your collection`,
  };
}

/**
 * Entry point for direct set URLs (e.g., /sets/75192-1).
 *
 * This server component fetches the set summary, then renders a client
 * component that adds the set to tabs and redirects to the SPA container.
 */
export default async function SetPage({ params }: SetPageProps) {
  const { setNumber } = await params;
  if (!setNumber) notFound();

  // Fetch set summary (no inventory prefetch - that happens in the SPA container)
  const summary =
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
    (await getSetSummary(setNumber).catch(() => null));

  if (!summary) notFound();

  return (
    <SetPageRedirector
      setNumber={summary.setNumber}
      setName={summary.name}
      year={summary.year}
      imageUrl={summary.imageUrl}
      numParts={summary.numParts}
      themeId={summary.themeId ?? null}
      themeName={summary.themeName ?? null}
    />
  );
}
