import 'server-only';

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent async work keyed by a string.
 * The promise is removed from the map once it settles.
 */
export function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory()
    .catch(err => {
      throw err;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
