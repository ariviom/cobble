import { PageLayout } from '@/app/components/layout/PageLayout';
import { PublicUserSetsOverview } from '@/app/components/user/PublicUserSetsOverview';
import { resolvePublicUser } from '@/app/lib/publicUsers';
import { fetchThemes } from '@/app/lib/services/themes';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { buildUserHandle } from '@/app/lib/users';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 0;

type PublicSetSummary = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number | null;
  theme_id: number | null;
  status: 'owned' | 'want' | null;
};

type PublicCollection = {
  id: string;
  name: string;
  sets: PublicSetSummary[];
};

type RouteParams = {
  handle?: string | string[];
};

export default async function PublicProfilePage({
  params,
}: {
  params?: Promise<RouteParams>;
}) {
  const resolvedParams = params ? await params : undefined;
  const handleParam = resolvedParams?.handle;
  const handleValue = Array.isArray(handleParam) ? handleParam[0] : handleParam;
  const handle = handleValue?.trim();

  if (!handle) {
    notFound();
  }

  const resolved = await resolvePublicUser(handle);

  if (resolved.type === 'not_found') {
    notFound();
  }

  if (resolved.type === 'private') {
    const handleToShow = buildUserHandle({
      user_id: resolved.info.user_id,
      username: resolved.info.username,
    });
    const displayName = resolved.info.display_name || 'This builder';

    return (
      <PageLayout>
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card-muted">
            <Lock className="h-8 w-8 text-foreground-muted" />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              This account is private
            </h1>
            <p className="text-sm text-foreground-muted">
              {displayName} has chosen to keep their collections private.
            </p>
          </div>
          <div className="mt-2 rounded-md border border-subtle bg-card px-3 py-2">
            <p className="font-mono text-xs text-foreground-muted">
              /user/{handleToShow}
            </p>
          </div>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-subtle bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card-muted"
            >
              Back to home
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const profile = resolved.profile;
  const supabase = getSupabaseServerClient();

  const [{ data: userSets }, { data: collections }, { data: memberships }] =
    await Promise.all([
      supabase
        .from('user_sets')
        .select<'set_num,status'>('set_num,status')
        .eq('user_id', profile.user_id),
      supabase
        .from('user_collections')
        .select<'id,name,is_system'>('id,name,is_system')
        .eq('user_id', profile.user_id)
        .order('name', { ascending: true }),
      supabase
        .from('user_collection_sets')
        .select<'collection_id,set_num'>('collection_id,set_num')
        .eq('user_id', profile.user_id),
    ]);

  // Build a map of set_num -> status from user_sets
  const setStatusMap = new Map<string, 'owned' | 'want'>();
  for (const row of userSets ?? []) {
    if (row.set_num && (row.status === 'owned' || row.status === 'want')) {
      setStatusMap.set(row.set_num, row.status);
    }
  }

  const ownedSetNums = Array.from(setStatusMap.entries())
    .filter(([, status]) => status === 'owned')
    .map(([setNum]) => setNum);
  const wishlistSetNums = Array.from(setStatusMap.entries())
    .filter(([, status]) => status === 'want')
    .map(([setNum]) => setNum);
  const collectionSetNums = (memberships ?? []).map(row => row.set_num);

  const allSetNums = Array.from(
    new Set([...ownedSetNums, ...wishlistSetNums, ...collectionSetNums])
  ).filter(Boolean);

  let setsById: Record<string, PublicSetSummary> = {};

  if (allSetNums.length > 0) {
    const { data: sets } = await supabase
      .from('rb_sets')
      .select<'set_num,name,year,image_url,num_parts,theme_id'>(
        'set_num,name,year,image_url,num_parts,theme_id'
      )
      .in('set_num', allSetNums);

    setsById = Object.fromEntries(
      (sets ?? []).map(set => {
        // Get status from user_sets if it exists, otherwise null for sets only in collections
        const status = setStatusMap.get(set.set_num) ?? null;
        return [
          set.set_num,
          {
            set_num: set.set_num,
            name: set.name,
            year: set.year,
            image_url: set.image_url,
            num_parts: set.num_parts,
            theme_id: set.theme_id,
            status,
          } satisfies PublicSetSummary,
        ];
      })
    );
  }

  const allSets: PublicSetSummary[] = allSetNums
    .map(setNum => setsById[setNum])
    .filter(Boolean);

  const collectionsById: PublicCollection[] = (collections ?? [])
    .filter(col => !col.is_system)
    .map(col => {
      const memberSetNums = (memberships ?? [])
        .filter(m => m.collection_id === col.id)
        .map(m => m.set_num);
      const sets = memberSetNums
        .map(setNum => setsById[setNum])
        .filter(Boolean)
        .map(set => ({
          ...set,
          // Collections can contain sets from both owned and wishlist
          // Use the status from setsById which was already determined
          status: set.status,
        }));
      return {
        id: col.id,
        name: col.name,
        sets,
      };
    });

  // Fetch themes for theme labels
  const themes = await fetchThemes().catch(() => []);

  const handleToShow = buildUserHandle({
    user_id: profile.user_id,
    username: profile.username,
  });

  const title = profile.display_name || 'Brick Party builder';

  return (
    <PageLayout>
      <section className="mb-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{title}</h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
                <span className="rounded-full bg-card-muted px-2 py-0.5 font-mono text-[11px] text-foreground-muted">
                  /user/{handleToShow}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Collections public
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <PublicUserSetsOverview
        allSets={allSets}
        collections={collectionsById}
        initialThemes={themes}
      />
    </PageLayout>
  );
}
