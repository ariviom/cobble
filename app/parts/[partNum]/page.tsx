import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageLayout } from '@/app/components/layout/PageLayout';
import {
  getPartByPartNum,
  getPartColors,
  getPartSetCount,
} from '@/app/lib/catalog/parts';
import { PartDetailClient } from './PartDetailClient';

type Props = { params: Promise<{ partNum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) return { title: 'Part Not Found' };

  return {
    title: `${part.name} (${part.part_num}) — Brick Party`,
    description: `View details, colors, and sets containing LEGO part ${part.part_num} — ${part.name}`,
  };
}

export default async function PartDetailPage({ params }: Props) {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) notFound();

  // Only fetch lightweight data server-side. Sets are loaded client-side with pagination.
  const [colors, rarityData] = await Promise.all([
    getPartColors(partNum),
    getPartSetCount(partNum),
  ]);

  return (
    <PageLayout noTopOffset>
      <PartDetailClient part={part} colors={colors} rarityData={rarityData} />
    </PageLayout>
  );
}
