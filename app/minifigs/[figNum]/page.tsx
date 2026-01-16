import { PageLayout } from '@/app/components/layout/PageLayout';
import { MinifigPageClient } from '@/app/components/minifig/MinifigPageClient';
import {
  getBlMinifigImageUrl,
  getMinifigMetaBl,
} from '@/app/lib/bricklink/minifigs';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type RouteParams = {
  figNum: string;
};

type MinifigPageProps = {
  params: Promise<RouteParams>;
};

type ServerMinifigMeta = {
  name: string | null;
  imageUrl: string | null;
  year: number | null;
  themeName: string | null;
};

async function getServerMinifigMeta(
  blMinifigNo: string
): Promise<ServerMinifigMeta> {
  let name: string | null = null;
  let year: number | null = null;
  let themeName: string | null = null;
  let imageUrl: string | null = null;

  try {
    // Get name and year from BrickLink catalog
    const meta = await getMinifigMetaBl(blMinifigNo);
    if (meta?.name) {
      name = meta.name;
    }
    if (meta?.itemYear) {
      year = meta.itemYear;
    }

    // Try to get image from bl_set_minifigs (cached)
    const supabase = getCatalogReadClient();
    const { data: blSetMinifig } = await supabase
      .from('bl_set_minifigs')
      .select('image_url, name')
      .eq('minifig_no', blMinifigNo)
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (blSetMinifig?.image_url) {
      imageUrl = blSetMinifig.image_url;
    }
    // Fall back to constructed BrickLink URL
    if (!imageUrl) {
      imageUrl = getBlMinifigImageUrl(blMinifigNo);
    }
    // Use bl_set_minifigs name as fallback
    if (!name && blSetMinifig?.name) {
      name = blSetMinifig.name;
    }

    // Get theme/category name from bricklink_minifigs + bricklink_categories
    if (meta?.categoryId) {
      const { data: category } = await supabase
        .from('bricklink_categories')
        .select('category_name')
        .eq('category_id', meta.categoryId)
        .maybeSingle();
      if (category?.category_name) {
        themeName = category.category_name;
      }
    }
  } catch {
    // Best-effort only - client will fetch full details
  }

  return { name, imageUrl, year, themeName };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const blMinifigNo = resolved?.figNum?.trim();

  if (!blMinifigNo) {
    return {
      title: 'Minifig',
    };
  }

  const { name } = await getServerMinifigMeta(blMinifigNo);
  const baseTitle = name ?? blMinifigNo;

  return {
    title: `${baseTitle} – Minifig`,
  };
}

export default async function MinifigPage({ params }: MinifigPageProps) {
  const { figNum } = await params;

  if (!figNum) {
    notFound();
  }

  // Fetch initial metadata on server so client can render immediately
  const initialMeta = await getServerMinifigMeta(figNum);

  return (
    <PageLayout>
      <MinifigPageClient
        figNum={figNum}
        initialName={initialMeta.name}
        initialImageUrl={initialMeta.imageUrl}
        initialYear={initialMeta.year}
        initialThemeName={initialMeta.themeName}
      />
    </PageLayout>
  );
}
