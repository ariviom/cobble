import { LRUCache, isTTLCacheValid, type TTLCacheEntry } from '@/app/lib/cache/lru';

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('stores and retrieves values', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('returns undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(10);
      expect(cache.get('missing')).toBeUndefined();
    });

    it('overwrites existing keys', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('a', 2);

      expect(cache.get('a')).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('deletes keys', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.delete('a');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('clears all entries', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });

    it('reports correct size', () => {
      const cache = new LRUCache<string, number>(10);
      expect(cache.size).toBe(0);

      cache.set('a', 1);
      expect(cache.size).toBe(1);

      cache.set('b', 2);
      expect(cache.size).toBe(2);

      cache.delete('a');
      expect(cache.size).toBe(1);
    });

    it('has() returns correct values', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when at capacity', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
      expect(cache.size).toBe(3);
    });

    it('accessing a key makes it most recently used', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it most recently used
      cache.get('a');

      // Add new entry - should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(1); // Still there
      expect(cache.get('b')).toBeUndefined(); // Evicted
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('setting an existing key makes it most recently used', () => {
      const cache = new LRUCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a' to make it most recently used
      cache.set('a', 10);

      // Add new entry - should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(10);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.size).toBe(3);
    });

    it('handles maxSize of 1', () => {
      const cache = new LRUCache<string, number>(1);
      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns undefined for expired entries', () => {
      const cache = new LRUCache<string, number>(10, 1000); // 1 second TTL
      cache.set('a', 1);

      expect(cache.get('a')).toBe(1);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      expect(cache.get('a')).toBeUndefined();
    });

    it('has() returns false for expired entries', () => {
      const cache = new LRUCache<string, number>(10, 1000);
      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);

      vi.advanceTimersByTime(1500);

      expect(cache.has('a')).toBe(false);
    });

    it('entries are valid before TTL expires', () => {
      const cache = new LRUCache<string, number>(10, 1000);
      cache.set('a', 1);

      vi.advanceTimersByTime(500); // Half of TTL

      expect(cache.get('a')).toBe(1);
    });

    it('setting a key resets its TTL', () => {
      const cache = new LRUCache<string, number>(10, 1000);
      cache.set('a', 1);

      vi.advanceTimersByTime(800); // Almost expired

      cache.set('a', 2); // Reset TTL

      vi.advanceTimersByTime(800); // Would have expired with old TTL

      expect(cache.get('a')).toBe(2); // Still valid
    });

    it('works without TTL (null)', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);

      vi.advanceTimersByTime(1000000); // Very long time

      expect(cache.get('a')).toBe(1); // Still valid
    });
  });

  describe('entries() and values()', () => {
    it('returns all entries', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);

      const entries = cache.entries();
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
    });

    it('returns all values', () => {
      const cache = new LRUCache<string, number>(10);
      cache.set('a', 1);
      cache.set('b', 2);

      const values = cache.values();
      expect(values).toHaveLength(2);
      expect(values).toContain(1);
      expect(values).toContain(2);
    });

    it('filters expired entries from values()', () => {
      vi.useFakeTimers();

      const cache = new LRUCache<string, number>(10, 1000);
      cache.set('a', 1);

      vi.advanceTimersByTime(500);
      cache.set('b', 2);

      vi.advanceTimersByTime(600); // 'a' is now expired

      const values = cache.values();
      expect(values).toHaveLength(1);
      expect(values).toContain(2);

      vi.useRealTimers();
    });
  });

  describe('constructor validation', () => {
    it('throws for maxSize less than 1', () => {
      expect(() => new LRUCache<string, number>(0)).toThrow();
      expect(() => new LRUCache<string, number>(-1)).toThrow();
    });

    it('accepts maxSize of 1', () => {
      expect(() => new LRUCache<string, number>(1)).not.toThrow();
    });
  });

  describe('stores null values correctly', () => {
    it('can store and retrieve null', () => {
      const cache = new LRUCache<string, number | null>(10);
      cache.set('a', null);

      expect(cache.has('a')).toBe(true);
      expect(cache.get('a')).toBeNull();
    });

    it('distinguishes between null and missing', () => {
      const cache = new LRUCache<string, number | null>(10);
      cache.set('a', null);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });
  });
});

describe('isTTLCacheValid', () => {
  it('returns false for null entry', () => {
    expect(isTTLCacheValid(null, 1000)).toBe(false);
  });

  it('returns false for undefined entry', () => {
    expect(isTTLCacheValid(undefined, 1000)).toBe(false);
  });

  it('returns true for valid entry within TTL', () => {
    const entry: TTLCacheEntry<string> = {
      at: Date.now() - 500,
      value: 'test',
    };
    expect(isTTLCacheValid(entry, 1000)).toBe(true);
  });

  it('returns false for expired entry', () => {
    const entry: TTLCacheEntry<string> = {
      at: Date.now() - 1500,
      value: 'test',
    };
    expect(isTTLCacheValid(entry, 1000)).toBe(false);
  });

  it('returns false for entry exactly at TTL boundary', () => {
    const entry: TTLCacheEntry<string> = {
      at: Date.now() - 1000,
      value: 'test',
    };
    expect(isTTLCacheValid(entry, 1000)).toBe(false);
  });
});


