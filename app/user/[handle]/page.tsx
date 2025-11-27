import { resolvePublicUser } from '@/app/lib/publicUsers';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { buildUserHandle } from '@/app/lib/users';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type PublicSetSummary = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number | null;
};

type PublicWishlistItem = {
  set: PublicSetSummary;
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

  const profile = await resolvePublicUser(handle);

  if (!profile) {
    notFound();
  }

  const supabase = getSupabaseServiceRoleClient();

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

  const wishlistSetNums = (userSets ?? [])
    .filter(row => row.status === 'want')
    .map(row => row.set_num);

  const collectionSetNums = (memberships ?? []).map(row => row.set_num);

  const allSetNums = Array.from(
    new Set([...wishlistSetNums, ...collectionSetNums])
  ).filter(Boolean);

  let setsById: Record<string, PublicSetSummary> = {};

  if (allSetNums.length > 0) {
    const { data: sets } = await supabase
      .from('rb_sets')
      .select<'set_num,name,year,image_url,num_parts'>(
        'set_num,name,year,image_url,num_parts'
      )
      .in('set_num', allSetNums);

    setsById = Object.fromEntries(
      (sets ?? []).map(set => [
        set.set_num,
        {
          set_num: set.set_num,
          name: set.name,
          year: set.year,
          image_url: set.image_url,
          num_parts: set.num_parts,
        } satisfies PublicSetSummary,
      ])
    );
  }

  const wishlist: PublicWishlistItem[] = wishlistSetNums
    .map(setNum => setsById[setNum])
    .filter(Boolean)
    .map(set => ({ set }));

  const collectionsById: PublicCollection[] = (collections ?? [])
    .filter(col => !col.is_system)
    .map(col => {
      const memberSetNums = (memberships ?? [])
        .filter(m => m.collection_id === col.id)
        .map(m => m.set_num);
      const sets = memberSetNums
        .map(setNum => setsById[setNum])
        .filter(Boolean);
      return {
        id: col.id,
        name: col.name,
        sets,
      };
    });

  const handleToShow = buildUserHandle({
    user_id: profile.user_id,
    username: profile.username,
  });

  const title = profile.display_name || 'Quarry builder';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 lg:px-6">
      <header className="flex flex-col gap-3 border-b border-border-subtle pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-foreground-muted">
            Public wishlist &amp; collections on Quarry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
          <span className="rounded-full bg-card-muted px-2 py-0.5 font-mono text-[11px] text-foreground-muted">
            /user/{handleToShow}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Collections public
          </span>
        </div>
      </header>

      <main className="flex flex-col gap-8">
        <section aria-labelledby="public-wishlist-heading">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2
                id="public-wishlist-heading"
                className="text-sm font-medium text-foreground"
              >
                Wishlist
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Sets this builder has marked as want-to-build.
              </p>
            </div>
          </div>
          {wishlist.length === 0 ? (
            <p className="mt-3 text-xs text-foreground-muted">
              No wishlist sets yet.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {wishlist.map(item => (
                <li
                  key={item.set.set_num}
                  className="flex flex-col rounded-md border border-border-subtle bg-card p-3 text-xs"
                >
                  <Link
                    href={`/sets/${encodeURIComponent(item.set.set_num)}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {item.set.set_num} — {item.set.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-foreground-muted">
                    {item.set.year && <span>{item.set.year}</span>}
                    {typeof item.set.num_parts === 'number' &&
                      item.set.num_parts > 0 && (
                        <span>{item.set.num_parts.toLocaleString()} parts</span>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="public-collections-heading">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2
                id="public-collections-heading"
                className="text-sm font-medium text-foreground"
              >
                Collections
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Custom groupings of sets curated by this builder.
              </p>
            </div>
          </div>

          {collectionsById.length === 0 ? (
            <p className="mt-3 text-xs text-foreground-muted">
              No custom collections yet.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {collectionsById.map(collection => (
                <div
                  key={collection.id}
                  className="rounded-md border border-border-subtle bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {collection.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-foreground-muted">
                        {collection.sets.length.toLocaleString()} sets
                      </p>
                    </div>
                  </div>
                  {collection.sets.length > 0 && (
                    <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                      {collection.sets.map(set => (
                        <li key={`${collection.id}-${set.set_num}`}>
                          <Link
                            href={`/sets/${encodeURIComponent(set.set_num)}`}
                            className="text-foreground hover:underline"
                          >
                            {set.set_num} — {set.name}
                          </Link>
                          <div className="text-[11px] text-foreground-muted">
                            {set.year && <span>{set.year}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
