'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type SearchPartyContextValue = {
  isInGroupSession: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected';
  hasConnectedOnce: boolean;
  sessionEnded: boolean;
};

const SearchPartyContext = createContext<SearchPartyContextValue | null>(null);

/** Returns null when outside a Search Party — safe for non-SP consumers. */
export function useOptionalSearchParty(): SearchPartyContextValue | null {
  return useContext(SearchPartyContext);
}

export function SearchPartyProvider({
  value,
  children,
}: {
  value: SearchPartyContextValue | null;
  children: ReactNode;
}) {
  return (
    <SearchPartyContext.Provider value={value}>
      {children}
    </SearchPartyContext.Provider>
  );
}
