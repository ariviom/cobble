'use client';

import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { Badge } from '@/app/components/ui/Badge';
import type { RarityTier } from '../types';

const tierConfig: Record<
  RarityTier,
  { label: string; variant: 'warning' | 'accent' | 'info' }
> = {
  exclusive: { label: 'Exclusive', variant: 'warning' },
  very_rare: { label: 'Very Rare', variant: 'accent' },
  rare: { label: 'Rare', variant: 'info' },
};

export function RarityBadge({ tier }: { tier: RarityTier }) {
  const { hasFeature } = useEntitlements();
  if (!hasFeature('rarity.enabled')) return null;

  const { label, variant } = tierConfig[tier];
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}
