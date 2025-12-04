export type MatchType = 'set' | 'theme' | 'subtheme';

/**
 * High-level search type for the /search page.
 * - 'set'      → standard set search
 * - 'minifig'  → minifigure search
 */
export type SearchType = 'set' | 'minifig';

export type FilterType = 'all' | MatchType;

export type SearchResult = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId?: number | null;
  /**
   * Optional human-readable theme name for this set, when available.
   */
  themeName?: string | null;
  /**
   * Optional full theme path (e.g., "Star Wars / Episode IV-VI").
   */
  themePath?: string | null;
  /**
   * Indicates whether this result matched directly on the set metadata,
   * via a top-level theme, or via a subtheme/child theme.
   */
  matchType?: MatchType;
};

export type SortOption =
  | 'relevance'
  | 'pieces-asc'
  | 'pieces-desc'
  | 'year-asc'
  | 'year-desc';

export type SearchPage = {
  results: SearchResult[];
  nextPage: number | null;
};

export type MinifigSearchResult = {
  figNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number | null;
};

export type MinifigSearchPage = {
  results: MinifigSearchResult[];
  nextPage: number | null;
};


