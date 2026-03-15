import { PageLayout } from '@/app/components/layout/PageLayout';
import { SetOverviewClient } from '@/app/components/set/SetOverviewClient';
import { getSetSummaryLocal } from '@/app/lib/catalog';
import {
  getSetMinifigsLocal,
  getBlMinifigImageUrl,
  findRbMinifigsByBlIds,
} from '@/app/lib/catalog/minifigs';
import { getRelatedSets } from '@/app/lib/catalog/relatedSets';
import { getSetInventoryStats } from '@/app/lib/catalog/sets';
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
    title: `${summary.name} (${summary.setNumber}) — Brick Party`,
    description: `View ${summary.name} (${summary.setNumber}) — ${summary.numParts} pieces, ${summary.year}. Browse parts, minifigures, and related sets.`,
  };
}

export default async function SetPage({ params }: SetPageProps) {
  const { setNumber } = await params;
  if (!setNumber) notFound();

  const summary =
    (await getSetSummaryLocal(setNumber).catch(() => null)) ??
    (await getSetSummary(setNumber).catch(() => null));

  if (!summary) notFound();

  // Parallel data fetching for overview content
  const [stats, rawMinifigs, relatedResult] = await Promise.all([
    getSetInventoryStats(summary.setNumber).catch(() => null),
    getSetMinifigsLocal(summary.setNumber).catch(() => []),
    summary.themeId != null
      ? getRelatedSets(summary.themeId, summary.setNumber, summary.year).catch(
          () => ({ sets: [], total: 0 })
        )
      : Promise.resolve({ sets: [], total: 0 }),
  ]);

  // Enrich minifigs with names and images (batch lookup, not N+1)
  const figIds = rawMinifigs.map(f => f.figNum);
  const rbMinifigMap =
    figIds.length > 0
      ? await findRbMinifigsByBlIds(figIds).catch(() => new Map())
      : new Map();

  const minifigs = rawMinifigs.map(fig => {
    const rbMinifig = rbMinifigMap.get(fig.figNum) ?? null;
    return {
      figNum: fig.figNum,
      name: rbMinifig?.name ?? null,
      imageUrl: rbMinifig?.bl_minifig_id
        ? getBlMinifigImageUrl(rbMinifig.bl_minifig_id)
        : null,
      numParts: rbMinifig?.num_parts ?? null,
      quantity: fig.quantity,
    };
  });

  return (
    <PageLayout>
      <SetOverviewClient
        setNumber={summary.setNumber}
        name={summary.name}
        year={summary.year}
        imageUrl={summary.imageUrl}
        numParts={summary.numParts}
        themeId={summary.themeId}
        themeName={summary.themeName}
        uniqueParts={stats?.uniqueParts ?? null}
        uniqueColors={stats?.uniqueColors ?? null}
        minifigs={minifigs}
        initialRelatedSets={relatedResult.sets}
        relatedSetsTotal={relatedResult.total}
      />
    </PageLayout>
  );
}
