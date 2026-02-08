import { GroupSessionPageClient } from '@/app/components/group/GroupSessionPageClient';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { notFound } from 'next/navigation';

type RouteParams = {
  slug?: string | string[];
};

export default async function GroupSessionPage({
  params,
}: {
  params?: Promise<RouteParams>;
}) {
  const resolvedParams = params ? await params : undefined;
  const slugParam = resolvedParams?.slug;
  const slugValue = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const slug = slugValue?.trim();
  if (!slug) {
    notFound();
  }

  const supabase = getSupabaseServerClient();

  const { data: session, error: sessionError } = await supabase
    .from('group_sessions')
    .select('id, set_num, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (sessionError || !session || !session.is_active) {
    notFound();
  }

  const { data: setRow, error: setError } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, num_parts, theme_id, image_url')
    .eq('set_num', session.set_num)
    .maybeSingle();

  if (setError || !setRow) {
    notFound();
  }

  return (
    <PageLayout constrainHeight>
      <GroupSessionPageClient
        sessionId={session.id}
        slug={slug}
        setNumber={setRow.set_num}
        setName={setRow.name}
        year={setRow.year ?? 0}
        imageUrl={setRow.image_url}
        numParts={setRow.num_parts ?? 0}
        themeId={setRow.theme_id}
      />
    </PageLayout>
  );
}
