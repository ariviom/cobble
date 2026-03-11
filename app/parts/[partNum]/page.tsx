import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import {
  getPartByPartNum,
  getPartColors,
  getPartSetCount,
  getSetsContainingPart,
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

  const [colors, rarityData, setNums] = await Promise.all([
    getPartColors(partNum),
    getPartSetCount(partNum),
    getSetsContainingPart(partNum),
  ]);

  // Fetch set metadata for display
  const { data: setMeta } =
    setNums.length > 0
      ? await getCatalogReadClient()
          .from('rb_sets')
          .select('set_num, name, year, image_url')
          .in('set_num', setNums.slice(0, 200))
      : { data: [] };

  return (
    <PageLayout>
      <PartDetailClient
        part={part}
        colors={colors}
        rarityData={rarityData}
        sets={setMeta ?? []}
      />
    </PageLayout>
  );
}
