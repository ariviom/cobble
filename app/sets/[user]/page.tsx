import { PageLayout } from '@/app/components/layout/PageLayout';
import { UserSetsOverview } from '@/app/components/home/UserSetsOverview';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { fetchThemes } from '@/app/lib/services/themes';
import { buildUserHandle } from '@/app/lib/users';
import type { Tables } from '@/supabase/types';
import { redirect } from 'next/navigation';

type RouteParams = {
  user?: string | string[];
};

type SearchParams = Record<string, string | string[] | undefined>;

type UserProfileRow = Tables<'user_profiles'>;
type UserId = UserProfileRow['user_id'];

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

type UserSetsPageProps = {
  params?: Promise<RouteParams>;
  searchParams?: Promise<SearchParams>;
};

export default async function UserSetsPage({
  params,
  searchParams,
}: UserSetsPageProps) {
  const supabase = await getSupabaseAuthServerClient();

  let userId: string | null = null;
  let username: string | null = null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      userId = null;
    } else {
      userId = user.id;

      const {
        data: profile,
      } = await (supabase as unknown as {
        from: (table: 'user_profiles') => {
          select: (columns: 'user_id,username') => {
            eq: (column: 'user_id', value: UserId) => {
              maybeSingle: () => Promise<{
                data: Pick<UserProfileRow, 'user_id' | 'username'> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from('user_profiles')
        .select('user_id,username')
        .eq('user_id', user.id as UserId)
        .maybeSingle();

      username = profile?.username ?? null;
    }
  } catch {
    userId = null;
    username = null;
  }

  const resolvedParams = params ? await params : {};
  const resolvedSearch = searchParams ? await searchParams : {};
  const initialView = extractInitialView(resolvedSearch);

  // If not logged in, show the same "create account" message as /sets.
  if (!userId) {
    return (
      <PageLayout>
        <section className="mb-8">
          <div className="mx-auto w-full max-w-3xl px-4 py-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create an account to track your sets
            </h1>
            <p className="mt-3 text-sm text-foreground-muted">
              Search, Identify, and Search Party work without an account, but
              managing owned sets, wishlists, and collections requires signing
              in.
            </p>
            <div className="mt-6">
              <a
                href="/login"
                className="inline-flex items-center rounded-md bg-theme-primary px-4 py-2 text-sm font-medium text-theme-primary-contrast shadow-sm transition-colors hover:bg-theme-primary/90"
              >
                Sign in to manage sets
              </a>
            </div>
          </div>
        </section>
      </PageLayout>
    );
  }

  const canonicalHandle = buildUserHandle({
    user_id: userId,
    username,
  });

  const handleParam = resolvedParams.user;
  const handleValue = Array.isArray(handleParam) ? handleParam[0] : handleParam;
  const requestedHandle = handleValue?.trim();

  // If the requested handle doesn't match the logged-in user's canonical handle,
  // redirect to the correct URL while preserving any query string.
  if (!requestedHandle || requestedHandle !== canonicalHandle) {
    const qs = buildSearchQueryString(resolvedSearch);
    const target = qs
      ? `/sets/${canonicalHandle}?${qs}`
      : `/sets/${canonicalHandle}`;
    redirect(target);
  }

  const themes = await fetchThemes().catch(() => []);

  return (
    <PageLayout>
      <UserSetsOverview initialThemes={themes} initialView={initialView} />
    </PageLayout>
  );
}




