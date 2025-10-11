export type SearchResult = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
};

export type SortOption =
  | 'relevance'
  | 'pieces-asc'
  | 'pieces-desc'
  | 'year-asc'
  | 'year-desc';

export type SearchResponse = {
  exactMatches: SearchResult[];
  otherMatches: SearchResult[];
  hasMore: boolean;
};
