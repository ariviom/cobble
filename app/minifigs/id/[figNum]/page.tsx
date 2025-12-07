import { PageLayout } from '@/app/components/layout/PageLayout';
import { MinifigPageClient } from '@/app/components/minifig/MinifigPageClient';
import { mapBrickLinkFigToRebrickable } from '@/app/lib/minifigMapping';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

type RouteParams = {
  figNum: string;
};

type MinifigPageProps = {
  params: Promise<RouteParams>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const raw = resolved?.figNum?.trim();
  const figNum =
    raw && !raw.toLowerCase().startsWith('fig-')
      ? ((await mapBrickLinkFigToRebrickable(raw)) ?? raw)
      : raw;

  if (!figNum) {
    return {
      title: 'Minifig',
    };
  }

  let name: string | null = null;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('rb_minifigs')
      .select('name')
      .eq('fig_num', figNum)
      .maybeSingle();

    if (!error && data && typeof data.name === 'string') {
      const trimmed = data.name.trim();
      if (trimmed) {
        name = trimmed;
      }
    }
  } catch {
    // Best-effort only; fall back to figNum
  }

  const baseTitle = name ?? figNum;

  return {
    title: `${baseTitle} – Minifig`,
  };
}

export default async function MinifigPage({ params }: MinifigPageProps) {
  const { figNum } = await params;

  if (!figNum) {
    notFound();
  }

  return (
    <PageLayout>
      <MinifigPageClient figNum={figNum} />
    </PageLayout>
  );
}
