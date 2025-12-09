import { PageLayout } from '@/app/components/layout/PageLayout';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { buildUserHandle } from '@/app/lib/users';
import type { Tables } from '@/supabase/types';
import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

type UserProfileRow = Tables<'user_profiles'>;
type UserId = UserProfileRow['user_id'];

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

export default async function CollectionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
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

  const resolvedSearch = searchParams ? await searchParams : {};

  if (!userId) {
    return (
      <PageLayout>
        <section className="mb-8">
          <div className="mx-auto w-full max-w-3xl px-4 py-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create an account to track your collection
            </h1>
            <p className="mt-3 text-sm text-foreground-muted">
              Search, Identify, and Search Party work without an account, but
              managing lists of sets and minifigures requires signing in.
            </p>
            <div className="mt-6">
              <a
                href="/login"
                className="inline-flex items-center rounded-md bg-theme-primary px-4 py-2 text-sm font-medium text-theme-primary-contrast shadow-sm transition-colors hover:bg-theme-primary/90"
              >
                Sign in to manage your collection
              </a>
            </div>
          </div>
        </section>
      </PageLayout>
    );
  }

  const handle = buildUserHandle({
    user_id: userId,
    username,
  });

  const qs = buildSearchQueryString(resolvedSearch);
  const target = qs ? `/collection/${handle}?${qs}` : `/collection/${handle}`;

  redirect(target);
}






