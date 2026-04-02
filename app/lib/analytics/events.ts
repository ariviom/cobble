/** Typed PostHog event names. Keep alphabetical. */
export const AnalyticsEvent = {
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_DELETED: 'account_deleted',
  COLLECTION_CREATED: 'collection_created',
  EXPORT_CREATED: 'export_created',
  IDENTIFY_USED: 'identify_used',
  SEARCH_PARTY_JOINED: 'search_party_joined',
  SEARCH_PARTY_STARTED: 'search_party_started',
  SET_OPENED: 'set_opened',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
