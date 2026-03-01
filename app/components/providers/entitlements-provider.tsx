'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

/** Client-safe subset of Entitlements — excludes server-only flag config. */
export type ClientEntitlements = {
  tier: 'free' | 'plus' | 'pro';
  features: string[];
};

type EntitlementsContextValue = {
  tier: ClientEntitlements['tier'];
  features: string[];
  isPlus: boolean;
  hasFeature: (key: string) => boolean;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null
);

const FREE_DEFAULTS: EntitlementsContextValue = {
  tier: 'free',
  features: [],
  isPlus: false,
  hasFeature: () => false,
};

type Props = PropsWithChildren<{
  initialEntitlements: ClientEntitlements | null;
}>;

export function EntitlementsProvider({ initialEntitlements, children }: Props) {
  const value = useMemo<EntitlementsContextValue>(() => {
    if (!initialEntitlements) return FREE_DEFAULTS;
    const featureSet = new Set(initialEntitlements.features);
    return {
      tier: initialEntitlements.tier,
      features: initialEntitlements.features,
      isPlus:
        initialEntitlements.tier === 'plus' ||
        initialEntitlements.tier === 'pro',
      hasFeature: (key: string) => featureSet.has(key),
    };
  }, [initialEntitlements]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error(
      'useEntitlements must be used within an EntitlementsProvider'
    );
  }
  return ctx;
}
