import { UserCollectionOverview } from '@/app/components/home/UserCollectionOverview';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { PublicUserCollectionOverview } from '@/app/components/user/PublicUserCollectionOverview';
import { resolvePublicUser } from '@/app/lib/publicUsers';
import { fetchThemes } from '@/app/lib/services/themes';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { buildUserHandle } from '@/app/lib/users';
import type { Tables } from '@/supabase/types';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

type RouteParams = {
  handle?: string | string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

type UserProfileRow = Tables<'user_profiles'>;
type UserId = UserProfileRow['user_id'];

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

function extractInitialView(
  params: SearchParams
): 'all' | 'owned' | 'wishlist' {
  const raw = params.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'owned') return 'owned';
  if (value === 'wishlist') return 'wishlist';
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

type CollectionPageProps = {
  params?: Promise<RouteParams>;
  searchParams?: Promise<SearchParams>;
};

export default async function CollectionHandlePage({
  params,
  searchParams,
}: CollectionPageProps) {
  const resolvedParams = params ? await params : {};
  const resolvedSearch = searchParams ? await searchParams : {};
  const initialView = extractInitialView(resolvedSearch);
  const initialType = extractInitialType(resolvedSearch);

  const handleParam = resolvedParams.handle;
  const handleValue = Array.isArray(handleParam) ? handleParam[0] : handleParam;
  const requestedHandle = handleValue?.trim();

  if (!requestedHandle) {
    notFound();
  }

  const resolved = await resolvePublicUser(requestedHandle);

  if (resolved.type === 'not_found') {
    notFound();
  }

  const supabaseAuth = await getSupabaseAuthServerClient();
  let currentUserId: string | null = null;
  let currentUsername: string | null = null;

  try {
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (user) {
      currentUserId = user.id;

      const { data: profile } = await (
        supabaseAuth as unknown as {
          from: (table: 'user_profiles') => {
            select: (columns: 'user_id,username') => {
              eq: (
                column: 'user_id',
                value: UserId
              ) => {
                maybeSingle: () => Promise<{
                  data: Pick<UserProfileRow, 'user_id' | 'username'> | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        }
      )
        .from('user_profiles')
        .select('user_id,username')
        .eq('user_id', user.id as UserId)
        .maybeSingle();

      currentUsername = profile?.username ?? null;
    }
  } catch {
    // ignore auth errors
  }

  const currentUserHandle = currentUserId
    ? buildUserHandle({
        user_id: currentUserId,
        username: currentUsername,
      })
    : null;

  const profileIdentity =
    resolved.type === 'public' ? resolved.profile : resolved.info;
  const canonicalHandle = buildUserHandle({
    user_id: profileIdentity.user_id,
    username: profileIdentity.username,
  });

  if (requestedHandle !== canonicalHandle) {
    const qs = buildSearchQueryString(resolvedSearch);
    const target = qs
      ? `/collection/${canonicalHandle}?${qs}`
      : `/collection/${canonicalHandle}`;
    redirect(target);
  }

  const isOwner = currentUserHandle === canonicalHandle;

  if (resolved.type === 'private' && !isOwner) {
    const displayName = profileIdentity.display_name || 'This builder';
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
              /collection/{canonicalHandle}
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

  if (isOwner) {
    const themes = await fetchThemes().catch(() => []);
    return (
      <PageLayout>
        <UserCollectionOverview
          initialThemes={themes}
          initialView={initialView}
          initialType={initialType}
        />
      </PageLayout>
    );
  }

  const supabase = getSupabaseServerClient();

  if (resolved.type !== 'public') {
    notFound();
  }

  const publicProfile = resolved.profile;

  const [
    { data: userSets },
    { data: userLists },
    { data: listItems },
    { data: userMinifigs },
  ] = await Promise.all([
    supabase
      .from('public_user_sets_view')
      .select<'set_num,status'>('set_num,status')
      .eq('user_id', publicProfile.user_id),
    supabase
      .from('public_user_lists_view')
      .select<'id,name,is_system'>('id,name,is_system')
      .eq('user_id', publicProfile.user_id)
      .order('name', { ascending: true }),
    supabase
      .from('public_user_list_items_view')
      .select<'list_id,item_type,set_num,minifig_id'>(
        'list_id,item_type,set_num,minifig_id'
      )
      .eq('user_id', publicProfile.user_id),
    supabase
      .from('public_user_minifigs_view')
      .select<'fig_num,status'>('fig_num,status')
      .eq('user_id', publicProfile.user_id),
  ]);

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
    if (list.is_system || !list.id) continue;
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
      if (!list.id) return null;
      const membership = listMembership.get(list.id) ?? {
        setNums: [],
        minifigIds: [],
      };
      return {
        id: list.id,
        name: list.name ?? '',
        setNums: membership.setNums,
        minifigIds: membership.minifigIds,
      };
    })
    .filter((v): v is PublicList => Boolean(v));

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
      image_url?: string | null;
      bl_id?: string | null;
    }
  > = {};

  if (allMinifigIds.length > 0) {
    const { data: minifigs } = await supabase
      .from('rb_minifigs')
      .select<'fig_num,name,num_parts'>('fig_num,name,num_parts')
      .in('fig_num', allMinifigIds);

    minifigMeta = Object.fromEntries(
      (minifigs ?? []).map(fig => [
        fig.fig_num,
        {
          name: fig.name,
          num_parts: fig.num_parts,
          image_url: null,
          bl_id: null,
        },
      ])
    );

    // Load BrickLink IDs for these figs.
    // BL mappings: global, then per-set fallback.
    const { data: mappings, error: mapErr } = await supabase
      .from('bricklink_minifig_mappings')
      .select('rb_fig_id,bl_item_id')
      .in('rb_fig_id', allMinifigIds);
    if (!mapErr) {
      for (const row of mappings ?? []) {
        const rbId = row.rb_fig_id;
        if (!rbId) continue;
        const existing = minifigMeta[rbId];
        minifigMeta[rbId] = {
          name: existing?.name ?? null,
          num_parts: existing?.num_parts ?? null,
          image_url: existing?.image_url ?? null,
          bl_id: row.bl_item_id ?? null,
        };
      }
    }

    const missingForBl = allMinifigIds.filter(id => !minifigMeta[id]?.bl_id);
    if (missingForBl.length > 0) {
      const { data: setMap, error: setErr } = await supabase
        .from('bl_set_minifigs')
        .select('rb_fig_id,minifig_no')
        .in('rb_fig_id', missingForBl);
      if (!setErr) {
        for (const row of setMap ?? []) {
          const rbId = row.rb_fig_id;
          if (!rbId) continue;
          const existing = minifigMeta[rbId];
          minifigMeta[rbId] = {
            name: existing?.name ?? null,
            num_parts: existing?.num_parts ?? null,
            image_url: existing?.image_url ?? null,
            bl_id: existing?.bl_id ?? row.minifig_no ?? null,
          };
        }
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

  const themes = await fetchThemes().catch(() => []);
  const title = publicProfile.username || 'Brick Party - User Collection';

  return (
    <PageLayout>
      <section className="mb-8">
        <div className="mx-auto w-full max-w-7xl">
          <h2 className="my-4 w-full text-center text-2xl font-semibold">
            {title}
          </h2>
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
