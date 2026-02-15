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
};

async function getServerMinifigMeta(
  blMinifigNo: string
): Promise<ServerMinifigMeta> {
  let name: string | null = null;
  let year: number | null = null;
  let themeName: string | null = null;
  let imageUrl: string | null = null;

  try {
    const supabase = getCatalogReadClient();

    // Lookup by bl_minifig_id first, then fall back to fig_num
    // (inventory links use RB fig_nums like "fig-005774")
    const { data: rbMinifigRows } = await supabase
      .from('rb_minifigs')
      .select('fig_num, name, bl_minifig_id')
      .eq('bl_minifig_id', blMinifigNo)
      .limit(1);
    let rbMinifig = rbMinifigRows?.[0] ?? null;

    if (!rbMinifig) {
      const { data: byFigNum } = await supabase
        .from('rb_minifigs')
        .select('fig_num, name, bl_minifig_id')
        .eq('fig_num', blMinifigNo)
        .limit(1);
      rbMinifig = byFigNum?.[0] ?? null;
    }

    if (rbMinifig?.name) {
      name = rbMinifig.name;
    }

    // Get RB image (checks cache, fetches from API on miss)
    if (rbMinifig?.fig_num) {
      imageUrl = await getOrFetchMinifigImageUrl(rbMinifig.fig_num);
    }

    // Get theme from rb_sets via rb_inventory_minifigs (first containing set)
    if (rbMinifig?.fig_num) {
      const { data: invMinifig } = await supabase
        .from('rb_inventory_minifigs')
        .select('inventory_id')
        .eq('fig_num', rbMinifig.fig_num)
        .limit(1)
        .maybeSingle();

      if (invMinifig?.inventory_id) {
        const { data: inv } = await supabase
          .from('rb_inventories')
          .select('set_num')
          .eq('id', invMinifig.inventory_id)
          .not('set_num', 'like', 'fig-%')
          .maybeSingle();

        if (inv?.set_num) {
          const { data: setRow } = await supabase
            .from('rb_sets')
            .select('year, theme_id')
            .eq('set_num', inv.set_num)
            .maybeSingle();

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
        }
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
