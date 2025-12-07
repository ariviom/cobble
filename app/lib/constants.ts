/**
 * Centralized constants for the application.
 * 
 * These constants replace magic numbers scattered across the codebase.
 * Group by domain for easy discovery.
 */

// =============================================================================
// API Rate Limiting
// =============================================================================

export const RATE_LIMIT = {
  /** Default rate limit window in milliseconds */
  WINDOW_MS: 60_000,
  /** Default maximum hits per window */
  MAX_HITS: 60,
  /** Maximum identify requests per window */
  IDENTIFY_MAX: 12,
} as const;

// =============================================================================
// Timeouts
// =============================================================================

export const TIMEOUT_MS = {
  /** Default API request timeout */
  DEFAULT: 30_000,
  /** BrickLink API request timeout */
  BRICKLINK: 30_000,
} as const;

// =============================================================================
// Pagination
// =============================================================================

export const PAGINATION = {
  /** Default page size for list endpoints */
  DEFAULT_PAGE_SIZE: 20,
  /** Maximum allowed page size */
  MAX_PAGE_SIZE: 100,
} as const;

// =============================================================================
// Image Upload
// =============================================================================

export const IMAGE = {
  /** Maximum image file size in bytes (5MB) */
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  /** Allowed image MIME types */
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ] as const,
} as const;

// =============================================================================
// Caching
// =============================================================================

export const CACHE = {
  /** Default cache TTL in milliseconds (1 hour) */
  TTL_MS: {
    DEFAULT: 3600_000,
    /** Price guide cache TTL (30 minutes) */
    PRICE_GUIDE: 1800_000,
    /** IndexedDB inventory cache TTL (24 hours) */
    INVENTORY_LOCAL: 24 * 60 * 60 * 1000,
  },
  /** Maximum cache entries */
  MAX_ENTRIES: 500,
} as const;

// =============================================================================
// External API Budgets (Identify)
// =============================================================================

export const EXTERNAL = {
  /** Maximum BrickLink color variants to fetch per identify request */
  BL_COLOR_VARIANT_LIMIT: 5,
  /** Maximum BrickLink supersets to fetch total per identify request */
  BL_SUPERSET_TOTAL_LIMIT: 40,
  /** Total external API call budget per identify request */
  EXTERNAL_CALL_BUDGET: 40,
  /** Maximum sets to enrich with Rebrickable metadata */
  ENRICH_LIMIT: 30,
} as const;

// =============================================================================
// Circuit Breaker (BrickLink)
// =============================================================================

export const CIRCUIT_BREAKER = {
  /** Maximum concurrent BrickLink requests */
  MAX_CONCURRENCY: 8,
  /** Consecutive failures before opening circuit */
  THRESHOLD: 5,
  /** Cooldown period when circuit is open (ms) */
  COOLDOWN_MS: 60_000,
} as const;
