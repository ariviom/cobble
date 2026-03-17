export type TourItemId =
  | 'search_set'
  | 'add_set'
  | 'identify_part'
  | 'mark_piece'
  | 'mark_piece_select'
  | 'mark_piece_filter_color'
  | 'mark_piece_group_category'
  | 'start_search_party'
  | 'review_settings';

export type TourItem = {
  id: TourItemId;
  label: string;
  subtext: string;
  route: string;
  routeLabel: string;
  requiresAuth: boolean;
  subtasks?: TourItem[];
  /** For mark_piece: use recent set route if available */
  dynamicRoute?: boolean;
};

export const TOUR_ITEMS: TourItem[] = [
  {
    id: 'search_set',
    label: 'Search for a set',
    subtext: 'Find sets by name or number',
    route: '/search',
    routeLabel: 'Go to Search',
    requiresAuth: false,
  },
  {
    id: 'add_set',
    label: 'Add a set to your collection',
    subtext: 'Mark a set as owned',
    route: '/sets',
    routeLabel: 'Go to Sets',
    requiresAuth: true,
  },
  {
    id: 'identify_part',
    label: 'Identify a part',
    subtext: 'Snap a photo to identify a piece',
    route: '/identify',
    routeLabel: 'Go to Identify',
    requiresAuth: true,
  },
  {
    id: 'mark_piece',
    label: 'Filter and mark pieces',
    subtext: 'Track your progress on a set',
    route: '/search',
    routeLabel: 'Go to Search',
    requiresAuth: true,
    dynamicRoute: true,
    subtasks: [
      {
        id: 'mark_piece_select',
        label: 'Mark a piece found',
        subtext: 'Tap a part to mark it found',
        route: '',
        routeLabel: '',
        requiresAuth: true,
      },
      {
        id: 'mark_piece_filter_color',
        label: 'Filter by color',
        subtext: 'Narrow parts by color',
        route: '',
        routeLabel: '',
        requiresAuth: true,
      },
      {
        id: 'mark_piece_group_category',
        label: 'Group by category',
        subtext: 'Organize parts by category',
        route: '',
        routeLabel: '',
        requiresAuth: true,
      },
    ],
  },
  {
    id: 'start_search_party',
    label: 'Start a Search Party',
    subtext: 'Search for pieces with friends',
    route: '/sets',
    routeLabel: 'Go to Sets',
    requiresAuth: true,
  },
  {
    id: 'review_settings',
    label: 'Review account settings',
    subtext: 'Customize your experience',
    route: '/account',
    routeLabel: 'Go to Account',
    requiresAuth: true,
  },
];

/** Top-level item IDs only (not subtasks) */
export const TOP_LEVEL_IDS: TourItemId[] = TOUR_ITEMS.map(i => i.id);

/** All item IDs including subtasks */
export const ALL_ITEM_IDS: TourItemId[] = TOUR_ITEMS.flatMap(i => [
  i.id,
  ...(i.subtasks?.map(s => s.id) ?? []),
]);

/** Parent completes when this subtask is done */
export const PARENT_COMPLETION_MAP: Partial<Record<TourItemId, TourItemId>> = {
  mark_piece: 'mark_piece_select',
};
