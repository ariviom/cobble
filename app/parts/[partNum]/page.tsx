import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { JsonLd } from '@/app/components/ui/JsonLd';
import {
  getPartByPartNum,
  getPartColors,
  getPartSetCount,
  getPartCategoryName,
} from '@/app/lib/catalog/parts';
import { PartDetailClient } from './PartDetailClient';

type Props = { params: Promise<{ partNum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) return { title: 'Part Not Found' };

  const description = `View details, colors, and sets containing LEGO part ${part.part_num} — ${part.name}`;

  return {
    title: `${part.name} (${part.part_num}) — Brick Party`,
    description,
    openGraph: {
      title: `${part.name} (${part.part_num})`,
      description,
      ...(part.image_url ? { images: [{ url: part.image_url }] } : {}),
    },
  };
}

export default async function PartDetailPage({ params }: Props) {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) notFound();

  // Only fetch lightweight data server-side. Sets are loaded client-side with pagination.
  const [colors, rarityData, categoryName] = await Promise.all([
    getPartColors(partNum),
    getPartSetCount(partNum),
    part.part_cat_id ? getPartCategoryName(part.part_cat_id) : null,
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: part.name,
    productID: part.part_num,
    ...(part.image_url ? { image: part.image_url } : {}),
    brand: { '@type': 'Brand', name: 'LEGO' },
    ...(categoryName ? { category: categoryName } : {}),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageLayout>
        <PartDetailClient part={part} colors={colors} rarityData={rarityData} />
      </PageLayout>
    </>
  );
}
