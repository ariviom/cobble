/**
 * A simple Least Recently Used (LRU) cache with optional TTL support.
 * Evicts the least recently accessed entries when capacity is exceeded.
 */
export class LRUCache<K, V> {
  private readonly cache: Map<K, { value: V; expiresAt: number | null }>;
  private readonly maxSize: number;
  private readonly ttlMs: number | null;

  /**
   * @param maxSize Maximum number of entries before eviction occurs
   * @param ttlMs Optional time-to-live in milliseconds for entries
   */
  constructor(maxSize: number, ttlMs?: number) {
    if (maxSize < 1) {
      throw new Error('LRUCache maxSize must be at least 1');
    }
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs ?? null;
  }

  /**
   * Get a value from the cache. Returns undefined if not found or expired.
   * Accessing a key moves it to the "most recently used" position.
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL expiration
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Set a value in the cache. Evicts LRU entry if at capacity.
   */
  set(key: K, value: V): void {
    // If key exists, delete it first so re-insertion puts it at end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest (first) entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const expiresAt = this.ttlMs !== null ? Date.now() + this.ttlMs : null;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Delete a key from the cache.
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all entries as an array of [key, value] pairs.
   * Does not filter expired entries for performance.
   */
  entries(): Array<[K, V]> {
    const result: Array<[K, V]> = [];
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt === null || now <= entry.expiresAt) {
        result.push([key, entry.value]);
      }
    }
    return result;
  }

  /**
   * Get all values. Filters out expired entries.
   */
  values(): V[] {
    const result: V[] = [];
    const now = Date.now();
    for (const entry of this.cache.values()) {
      if (entry.expiresAt === null || now <= entry.expiresAt) {
        result.push(entry.value);
      }
    }
    return result;
  }
}

/**
 * Create a TTL-based cache entry wrapper for simpler caches that just need
 * time-based expiration without LRU eviction.
 */
export type TTLCacheEntry<T> = {
  at: number;
  value: T;
};

/**
 * Check if a TTL cache entry is still valid.
 */
export function isTTLCacheValid<T>(
  entry: TTLCacheEntry<T> | null | undefined,
  ttlMs: number
): entry is TTLCacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.at < ttlMs;
}




