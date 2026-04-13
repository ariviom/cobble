import { UserCollectionOverview } from '@/app/components/home/UserCollectionOverview';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { PublicUserCollectionOverview } from '@/app/components/user/PublicUserCollectionOverview';
import { resolvePublicUser } from '@/app/lib/publicUsers';
import { fetchPublicCollectionPayload } from '@/app/lib/services/publicCollection';
import { fetchThemes } from '@/app/lib/services/themes';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { buildUserHandle } from '@/app/lib/users';
import type { Metadata } from 'next';
import { getUserUsername } from '@/app/lib/server/getUserProfile';
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

function extractInitialView(
  params: SearchParams
): 'all' | 'owned' | 'wishlist' {
  const raw = params.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'owned') return 'owned';
  if (value === 'wishlist') return 'wishlist';
  return 'all';
}

function extractInitialType(
  params: SearchParams
): 'sets' | 'minifigs' | 'parts' {
  const raw = params.type;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'minifigs') return 'minifigs';
  if (value === 'parts') return 'parts';
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
  let currentUserId: string | null = null;
  let currentUsername: string | null = null;

  try {
    const supabaseAuth = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (user) {
      currentUserId = user.id;
      currentUsername = await getUserUsername(supabaseAuth, user.id);
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

  if (resolved.type !== 'public') {
    notFound();
  }

  const publicProfile = resolved.profile;

  const payload = await fetchPublicCollectionPayload(publicProfile.user_id);
  const allSets = payload.allSets;
  const allMinifigs = payload.allMinifigs;
  const allPublicParts = payload.allParts;
  const publicLists = payload.lists;

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
        allParts={allPublicParts}
        lists={publicLists}
        initialThemes={themes}
        initialView={initialView}
        initialType={initialType}
      />
    </PageLayout>
  );
}
