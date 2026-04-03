import { PageLayout } from '@/app/components/layout/PageLayout';
import { MinifigPageClient } from '@/app/components/minifig/MinifigPageClient';
import { JsonLd } from '@/app/components/ui/JsonLd';
import {
  findRbMinifig,
  getBlMinifigImageUrl,
  getOrFetchMinifigImageUrl,
} from '@/app/lib/catalog/minifigs';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { resolveBlMinifigId } from '@/app/lib/services/minifigMapping';
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
  numParts: number | null;
  blId: string | null;
  setsCount: number;
  minSubpartSetCount: number | null;
};

async function getServerMinifigMeta(
  blMinifigNo: string
): Promise<ServerMinifigMeta> {
  const empty: ServerMinifigMeta = {
    name: null,
    imageUrl: null,
    year: null,
    themeName: null,
    numParts: null,
    blId: null,
    setsCount: 0,
    minSubpartSetCount: null,
  };

  try {
    const supabase = getCatalogReadClient();

    let rbMinifig = await findRbMinifig(blMinifigNo);

    // Self-healing: if not found, try resolving the BL ID mapping
    if (!rbMinifig) {
      const resolved = await resolveBlMinifigId(blMinifigNo);
      if (resolved) {
        rbMinifig = await findRbMinifig(resolved);
      }
    }

    if (!rbMinifig) return empty;

    const rbFigNum = rbMinifig.fig_num;
    const blId = rbMinifig.bl_minifig_id ?? blMinifigNo;

    // Parallelize independent work: image fetch + sets/theme lookup + rarity
    const [imageUrl, setsResult, rarityRow] = await Promise.all([
      getOrFetchMinifigImageUrl(rbFigNum, blId),
      getSetsCountAndTheme(supabase, rbFigNum),
      supabase
        .from('rb_minifig_rarity')
        .select('min_subpart_set_count')
        .eq('fig_num', rbFigNum)
        .maybeSingle()
        .then(({ data }) => data),
    ]);

    return {
      name: rbMinifig.name ?? null,
      imageUrl: imageUrl ?? getBlMinifigImageUrl(blId),
      year: setsResult.year,
      themeName: setsResult.themeName,
      numParts: rbMinifig.num_parts ?? null,
      blId: rbMinifig.bl_minifig_id ?? null,
      setsCount: setsResult.setsCount,
      minSubpartSetCount: rarityRow?.min_subpart_set_count ?? null,
    };
  } catch {
    // Best-effort only
    return empty;
  }
}

/** Get distinct sets count + theme/year from the first containing set (catalog only). */
async function getSetsCountAndTheme(
  supabase: ReturnType<typeof getCatalogReadClient>,
  rbFigNum: string
): Promise<{
  setsCount: number;
  year: number | null;
  themeName: string | null;
}> {
  // Get all inventory entries for this minifig
  const { data: invMinifigs } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id')
    .eq('fig_num', rbFigNum);

  if (!invMinifigs?.length)
    return { setsCount: 0, year: null, themeName: null };

  const invIds = invMinifigs.map(im => im.inventory_id);

  // Get set inventories (exclude fig-* entries)
  const { data: rawInventories } = await supabase
    .from('rb_inventories')
    .select('set_num')
    .in('id', invIds)
    .not('set_num', 'like', 'fig-%');

  const setNums = [
    ...new Set(
      (rawInventories ?? [])
        .map(inv => inv.set_num)
        .filter((s): s is string => typeof s === 'string')
    ),
  ];
  if (setNums.length === 0)
    return { setsCount: 0, year: null, themeName: null };

  // Get theme/year from the first set
  const { data: setRow } = await supabase
    .from('rb_sets')
    .select('year, theme_id')
    .eq('set_num', setNums[0]!)
    .maybeSingle();

  let year: number | null = null;
  let themeName: string | null = null;

  if (setRow) {
    if (typeof setRow.year === 'number' && setRow.year > 0) {
      year = setRow.year;
    }
    if (typeof setRow.theme_id === 'number') {
      const { data: theme } = await supabase
        .from('rb_themes')
        .select('name')
        .eq('id', setRow.theme_id)
        .maybeSingle();
      if (theme?.name) {
        themeName = theme.name;
      }
    }
  }

  return { setsCount: setNums.length, year, themeName };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const blMinifigNo = resolved?.figNum?.trim();

  if (!blMinifigNo) {
    return { title: 'Minifig' };
  }

  const meta = await getServerMinifigMeta(blMinifigNo);
  const baseTitle = meta.name ?? blMinifigNo;
  const description = meta.name
    ? `View ${meta.name} minifigure — appears in ${meta.setsCount} set${meta.setsCount !== 1 ? 's' : ''}${meta.themeName ? ` · ${meta.themeName}` : ''}`
    : `View LEGO minifigure ${blMinifigNo}`;

  return {
    title: `${baseTitle} – Minifig | Brick Party`,
    description,
    openGraph: {
      title: baseTitle,
      description,
      ...(meta.imageUrl ? { images: [{ url: meta.imageUrl }] } : {}),
    },
  };
}

export default async function MinifigPage({ params }: MinifigPageProps) {
  const { figNum } = await params;

  if (!figNum) {
    notFound();
  }

  const initialMeta = await getServerMinifigMeta(figNum);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: initialMeta.name ?? figNum,
    productID: figNum,
    ...(initialMeta.imageUrl ? { image: initialMeta.imageUrl } : {}),
    brand: { '@type': 'Brand', name: 'LEGO' },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageLayout>
        <MinifigPageClient
          figNum={figNum}
          initialName={initialMeta.name}
          initialImageUrl={initialMeta.imageUrl}
          initialYear={initialMeta.year}
          initialThemeName={initialMeta.themeName}
          initialNumParts={initialMeta.numParts}
          initialBlId={initialMeta.blId}
          initialSetsCount={initialMeta.setsCount}
          initialMinSubpartSetCount={initialMeta.minSubpartSetCount}
        />
      </PageLayout>
    </>
  );
}
