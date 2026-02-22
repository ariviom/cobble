import { UserCollectionOverview } from '@/app/components/home/UserCollectionOverview';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { PublicUserCollectionOverview } from '@/app/components/user/PublicUserCollectionOverview';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { resolvePublicUser } from '@/app/lib/publicUsers';
import { fetchThemes } from '@/app/lib/services/themes';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { buildUserHandle } from '@/app/lib/users';
import type { Metadata } from 'next';
import type { Tables } from '@/supabase/types';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle?: string | string[] }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const handleStr = Array.isArray(handle) ? handle[0] : handle;
  if (!handleStr) {
    return { title: 'Collection | Brick Party' };
  }

  const resolved = await resolvePublicUser(handleStr).catch(() => null);
  if (resolved?.type === 'public') {
    const displayName = resolved.profile.display_name || handleStr;
    return {
      title: `${displayName}'s Collection | Brick Party`,
      description: `View ${displayName}'s LEGO set collection`,
    };
  }

  return {
    title: 'My Collection | Brick Party',
    description: 'View and manage your LEGO set collection',
  };
}

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
  owned: boolean;
};

type PublicMinifigSummary = {
  fig_num: string;
  name: string | null;
  num_parts: number | null;
  status: 'owned' | 'want' | null;
  image_url: string | null;
  bl_id: string | null;
  year: number | null;
  categoryId: number | null;
  categoryName: string | null;
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

  // Check auth first — a logged-in user viewing their own collection should
  // always work, even if they have no user_profiles row yet (new users).
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

  // Owner check: if the current user's handle matches the requested handle,
  // render their collection directly without needing a public profile row.
  const isOwner = currentUserHandle === requestedHandle;

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

  // For non-owner views, resolve the profile to check public/private status.
  const resolved = await resolvePublicUser(requestedHandle);

  if (resolved.type === 'not_found') {
    notFound();
  }

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

  // Also check if the current user owns this profile (e.g. they navigated
  // via username but are logged in with the same account).
  const isOwnerByProfile = currentUserHandle === canonicalHandle;

  if (resolved.type === 'private' && !isOwnerByProfile) {
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
          <div className="mt-2 rounded-lg border border-subtle bg-card px-3 py-2">
            <p className="font-mono text-xs text-foreground-muted">
              /collection/{canonicalHandle}
            </p>
          </div>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-subtle bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card-muted"
            >
              Back to home
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (isOwnerByProfile) {
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
      .select('set_num,owned')
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

  // Extract owned set numbers from the view
  const ownedSetNums: string[] = [];
  for (const row of (userSets ?? []) as Array<{
    set_num: string | null;
    owned: boolean | null;
  }>) {
    if (row.set_num && row.owned) {
      ownedSetNums.push(row.set_num);
    }
  }
  // Wishlist is now tracked via user_lists (system list), not user_sets
  const wishlistSetNums: string[] = [];

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

    const ownedSet = new Set(ownedSetNums);
    setsById = Object.fromEntries(
      (sets ?? []).map(set => {
        return [
          set.set_num,
          {
            set_num: set.set_num,
            name: set.name,
            year: set.year,
            image_url: set.image_url,
            num_parts: set.num_parts,
            theme_id: set.theme_id,
            owned: ownedSet.has(set.set_num),
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

  // Category name lookup - populated during minifig meta fetch
  const categoryNameById = new Map<number, string>();

  const minifigMeta: Record<
    string,
    {
      name: string | null;
      num_parts: number | null;
      image_url?: string | null;
      bl_id?: string | null;
      year?: number | null;
      categoryId?: number | null;
    }
  > = {};

  if (allMinifigIds.length > 0) {
    const catalogClient = getCatalogReadClient();

    // Query rb_minifigs for names, num_parts, and BL IDs
    const { data: rbMinifigs } = await catalogClient
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .in(
        'bl_minifig_id',
        allMinifigIds.filter(id => !id.startsWith('fig-'))
      );

    for (const fig of rbMinifigs ?? []) {
      const blId = fig.bl_minifig_id;
      if (!blId) continue;
      minifigMeta[blId] = {
        name: fig.name ?? null,
        num_parts: fig.num_parts ?? null,
        image_url: null,
        bl_id: blId,
        year: null,
      };
    }

    // Also check for any fig-* style IDs (RB format)
    const rbStyleIds = allMinifigIds.filter(id => id.startsWith('fig-'));
    if (rbStyleIds.length > 0) {
      const { data: rbByFigNum } = await catalogClient
        .from('rb_minifigs')
        .select('fig_num, name, num_parts, bl_minifig_id')
        .in('fig_num', rbStyleIds);

      for (const fig of rbByFigNum ?? []) {
        const key = fig.bl_minifig_id ?? fig.fig_num;
        minifigMeta[key] = {
          name: fig.name ?? null,
          num_parts: fig.num_parts ?? null,
          image_url: null,
          bl_id: fig.bl_minifig_id ?? null,
          year: null,
        };
      }
    }

    // Get images from rb_minifig_images
    const figNums = (rbMinifigs ?? [])
      .map(f => f.fig_num)
      .concat(rbStyleIds)
      .filter(Boolean);
    if (figNums.length > 0) {
      const { data: images } = await catalogClient
        .from('rb_minifig_images')
        .select('fig_num, image_url')
        .in('fig_num', figNums);

      // Build fig_num → bl_minifig_id map for image assignment
      const figToBlId = new Map<string, string>();
      for (const fig of rbMinifigs ?? []) {
        if (fig.bl_minifig_id) {
          figToBlId.set(fig.fig_num, fig.bl_minifig_id);
        }
      }

      for (const img of images ?? []) {
        const blId = figToBlId.get(img.fig_num) ?? img.fig_num;
        const existing = minifigMeta[blId];
        if (existing && img.image_url) {
          existing.image_url = img.image_url;
        }
      }
    }
  }

  const allMinifigs: PublicMinifigSummary[] = allMinifigIds.map(figNum => {
    const meta = minifigMeta[figNum];
    const categoryId = meta?.categoryId ?? null;
    return {
      fig_num: figNum,
      name: meta?.name ?? figNum,
      num_parts: meta?.num_parts ?? null,
      status: minifigStatusMap.get(figNum) ?? null,
      image_url: meta?.image_url ?? null,
      bl_id: meta?.bl_id ?? figNum,
      year: meta?.year ?? null,
      categoryId,
      categoryName: categoryId
        ? (categoryNameById.get(categoryId) ?? null)
        : null,
    };
  });

  const themes = await fetchThemes().catch(() => []);
  const title = publicProfile.username || 'Brick Party - User Collection';

  return (
    <PageLayout>
      <section className="mb-8 px-4">
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
