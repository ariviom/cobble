import { PageLayout } from '@/app/components/layout/PageLayout';
import { PublicUserCollectionOverview } from '@/app/components/user/PublicUserCollectionOverview';
import { resolvePublicUser } from '@/app/lib/publicUsers';
import { fetchThemes } from '@/app/lib/services/themes';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { buildUserHandle } from '@/app/lib/users';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

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

type PublicMinifigSummary = {
  fig_num: string;
  name: string | null;
  num_parts: number | null;
  status: 'owned' | 'want' | null;
  image_url: string | null;
  bl_id: string | null;
};

type PublicList = {
  id: string;
  name: string;
  setNums: string[];
  minifigIds: string[];
};

type RouteParams = {
  handle?: string | string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

function extractInitialView(
  params: SearchParams
): 'all' | 'owned' | 'wishlist' {
  const raw = params.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'owned') return 'owned';
  if (value === 'wishlist') return 'wishlist';
  // Treat legacy ?view=collections as "all" for compatibility.
  return 'all';
}

function extractInitialType(params: SearchParams): 'sets' | 'minifigs' {
  const raw = params.type;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'minifigs') return 'minifigs';
  return 'sets';
}

function buildSearchQueryString(params: SearchParams): string {
  const qp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      qp.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        qp.append(key, v);
      }
    }
  }
  return qp.toString();
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params?: Promise<RouteParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = params ? await params : undefined;
  const resolvedSearch = searchParams ? await searchParams : {};
  const initialView = extractInitialView(resolvedSearch);
  const initialType = extractInitialType(resolvedSearch);
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
              This user’s collection is private.
            </h1>
            <p className="text-sm text-foreground-muted">
              {displayName} has chosen to keep their collection private.
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
  const canonicalHandle = buildUserHandle({
    user_id: profile.user_id,
    username: profile.username,
  });

  // If the requested handle doesn't match the canonical handle (username when present,
  // otherwise user_id), redirect to the canonical URL, preserving any query params.
  if (handle !== canonicalHandle) {
    const qs = buildSearchQueryString(resolvedSearch);
    const target = qs
      ? `/user/${canonicalHandle}?${qs}`
      : `/user/${canonicalHandle}`;
    redirect(target);
  }

  const supabase = getSupabaseServerClient();

  const [
    { data: userSets },
    { data: userLists },
    { data: listItems },
    { data: userMinifigs },
  ] = await Promise.all([
    supabase
      .from('public_user_sets_view')
      .select<'set_num,status'>('set_num,status')
      .eq('user_id', profile.user_id),
    supabase
      .from('public_user_lists_view')
      .select<'id,name,is_system'>('id,name,is_system')
      .eq('user_id', profile.user_id)
      .order('name', { ascending: true }),
    supabase
      .from('public_user_list_items_view')
      .select<'list_id,item_type,set_num,minifig_id'>(
        'list_id,item_type,set_num,minifig_id'
      )
      .eq('user_id', profile.user_id),
    supabase
      .from('public_user_minifigs_view')
      .select<'fig_num,status'>('fig_num,status')
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

  const listMembership = new Map<
    string,
    { setNums: string[]; minifigIds: string[] }
  >();

  for (const list of userLists ?? []) {
    if (list.is_system) continue;
    if (!list.id) continue;
    listMembership.set(list.id, { setNums: [], minifigIds: [] });
  }

  for (const item of listItems ?? []) {
    if (!item.list_id) continue;
    const bucket = listMembership.get(item.list_id);
    if (!bucket) continue;
    if (item.item_type === 'set' && item.set_num) {
      bucket.setNums.push(item.set_num);
    } else if (item.item_type === 'minifig' && item.minifig_id) {
      bucket.minifigIds.push(item.minifig_id);
    }
  }

  const listSetNums = Array.from(listMembership.values()).flatMap(
    membership => membership.setNums
  );
  const listMinifigIds = Array.from(listMembership.values()).flatMap(
    membership => membership.minifigIds
  );

  const allSetNums = Array.from(
    new Set([...ownedSetNums, ...wishlistSetNums, ...listSetNums])
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

  const publicLists: PublicList[] = (userLists ?? [])
    .filter(list => !list.is_system && !!list.id)
    .map(list => {
      const membership = listMembership.get(list.id!) ?? {
        setNums: [],
        minifigIds: [],
      };
      return {
        id: list.id!,
        name: list.name ?? '',
        setNums: membership.setNums,
        minifigIds: membership.minifigIds,
      };
    });

  const minifigStatusMap = new Map<string, PublicMinifigSummary['status']>();
  for (const row of userMinifigs ?? []) {
    if (row.fig_num) {
      minifigStatusMap.set(row.fig_num, row.status ?? null);
    }
  }

  const allMinifigIds = Array.from(
    new Set([...minifigStatusMap.keys(), ...listMinifigIds])
  ).filter(Boolean);

  let minifigMeta: Record<
    string,
    {
      name: string | null;
      num_parts: number | null;
      image_url: string | null;
      bl_id?: string | null;
    }
  > = {};

  if (allMinifigIds.length > 0) {
    // user_minifigs.fig_num stores BrickLink IDs directly (e.g., sw0001)
    // Look up metadata from bricklink_minifigs catalog
    const { data: minifigs } = await supabase
      .from('bricklink_minifigs')
      .select('item_id,name')
      .in('item_id', allMinifigIds);

    minifigMeta = Object.fromEntries(
      (minifigs ?? []).map(fig => [
        fig.item_id,
        {
          name: fig.name,
          num_parts: null, // BL catalog doesn't have num_parts
          image_url: null,
          bl_id: fig.item_id, // Already a BL ID
        },
      ])
    );

    // For any IDs not found in bricklink_minifigs, set bl_id to the ID itself
    // (self-healing will populate the catalog on minifig page view)
    for (const figId of allMinifigIds) {
      if (!minifigMeta[figId]) {
        minifigMeta[figId] = {
          name: figId,
          num_parts: null,
          image_url: null,
          bl_id: figId,
        };
      }
    }
  }

  const allMinifigs: PublicMinifigSummary[] = allMinifigIds.map(figNum => ({
    fig_num: figNum,
    name: minifigMeta[figNum]?.name ?? figNum,
    num_parts: minifigMeta[figNum]?.num_parts ?? null,
    status: minifigStatusMap.get(figNum) ?? null,
    image_url: minifigMeta[figNum]?.image_url ?? null,
    bl_id: minifigMeta[figNum]?.bl_id ?? null,
  }));

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
                <span className="text-2xs rounded-full bg-card-muted px-2 py-0.5 font-mono text-foreground-muted">
                  /collection/{handleToShow}
                </span>
                <span className="text-2xs inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Lists public
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <PublicUserCollectionOverview
        allSets={allSets}
        allMinifigs={allMinifigs}
        lists={publicLists}
        initialThemes={themes}
        initialView={initialView}
        initialType={initialType}
      />
    </PageLayout>
  );
}
