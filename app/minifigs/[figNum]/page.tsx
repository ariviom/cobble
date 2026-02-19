import { PageLayout } from '@/app/components/layout/PageLayout';
import { MinifigPageClient } from '@/app/components/minifig/MinifigPageClient';
import { getOrFetchMinifigImageUrl } from '@/app/lib/catalog/minifigs';
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

    // Lookup by bl_minifig_id first, then fall back to fig_num
    // (inventory links use RB fig_nums like "fig-005774")
    const { data: rbMinifigRows } = await supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .eq('bl_minifig_id', blMinifigNo)
      .limit(1);
    let rbMinifig = rbMinifigRows?.[0] ?? null;

    if (!rbMinifig) {
      const { data: byFigNum } = await supabase
        .from('rb_minifigs')
        .select('fig_num, name, num_parts, bl_minifig_id')
        .eq('fig_num', blMinifigNo)
        .limit(1);
      rbMinifig = byFigNum?.[0] ?? null;
    }

    if (!rbMinifig) return empty;

    const rbFigNum = rbMinifig.fig_num;

    // Parallelize independent work: image fetch + sets/theme lookup + rarity
    const [imageUrl, setsResult, rarityRow] = await Promise.all([
      rbFigNum ? getOrFetchMinifigImageUrl(rbFigNum) : Promise.resolve(null),
      rbFigNum
        ? getSetsCountAndTheme(supabase, rbFigNum)
        : Promise.resolve({ setsCount: 0, year: null, themeName: null }),
      rbFigNum
        ? supabase
            .from('rb_minifig_rarity')
            .select('min_subpart_set_count')
            .eq('fig_num', rbFigNum)
            .maybeSingle()
            .then(({ data }) => data)
        : Promise.resolve(null),
    ]);

    return {
      name: rbMinifig.name ?? null,
      imageUrl,
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
        initialNumParts={initialMeta.numParts}
        initialBlId={initialMeta.blId}
        initialSetsCount={initialMeta.setsCount}
        initialMinSubpartSetCount={initialMeta.minSubpartSetCount}
      />
    </PageLayout>
  );
}
