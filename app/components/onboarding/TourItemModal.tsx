'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Modal } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { useOnboarding } from '@/app/hooks/useOnboarding';
import type { TourItem } from './tourConfig';
import { getRecentSets } from '@/app/store/recent-sets';

type Props = {
  item: TourItem | null;
  open: boolean;
  onClose: () => void;
  videoUrl?: string;
};

export function TourItemModal({ item, open, onClose, videoUrl }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolveRoute, resolveRouteLabel, collapse } = useOnboarding();

  if (!item) return null;

  const route = resolveRoute(item);
  const routeLabel = resolveRouteLabel(item);
  const needsSetFirst = item.dynamicRoute && getRecentSets().length === 0;
  const routeBase = item.dynamicRoute ? '/sets' : route;
  const alreadyOnRoute =
    pathname === routeBase || pathname.startsWith(routeBase + '/');

  const handleGo = () => {
    onClose();
    collapse();
    router.push(route);
  };

  return (
    <Modal open={open} title={item.label} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">{item.subtext}</p>

        {needsSetFirst && (
          <p className="text-sm text-foreground-muted italic">
            Add a set first to mark pieces found.
          </p>
        )}

        {videoUrl && (
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full rounded-md"
          />
        )}

        {!alreadyOnRoute && (
          <Button variant="primary" onClick={handleGo}>
            {routeLabel}
          </Button>
        )}
      </div>
    </Modal>
  );
}
