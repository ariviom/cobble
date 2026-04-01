'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Modal } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { useOnboarding } from '@/app/hooks/useOnboarding';
import type { TourItem } from './tourConfig';
import { getTourVideoUrl } from './tourVideos';
import { VideoLightbox } from './VideoLightbox';
import { getRecentSets } from '@/app/store/recent-sets';

type Props = {
  item: TourItem | null;
  open: boolean;
  onClose: () => void;
};

export function TourItemModal({ item, open, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolveRoute, resolveRouteLabel, collapse } = useOnboarding();
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!item) return null;

  const route = resolveRoute(item);
  const routeLabel = resolveRouteLabel(item);
  const needsSetFirst = item.dynamicRoute && getRecentSets().length === 0;
  const routeBase = item.dynamicRoute ? '/sets' : route;
  const alreadyOnRoute =
    pathname === routeBase || pathname.startsWith(routeBase + '/');

  const mobileVideoUrl = item.videoKey
    ? getTourVideoUrl(item.videoKey, false)
    : null;
  const desktopVideoUrl = item.videoKey
    ? getTourVideoUrl(item.videoKey, true)
    : null;

  const handleGo = () => {
    onClose();
    collapse();
    router.push(route);
  };

  return (
    <>
      <Modal open={open} title={item.label} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-foreground-muted">
            {item.subtext}
          </p>

          {needsSetFirst && (
            <p className="text-center text-sm text-foreground-muted italic">
              Add a set first to mark pieces found.
            </p>
          )}

          {mobileVideoUrl && desktopVideoUrl && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setLightboxOpen(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') setLightboxOpen(true);
              }}
              className="group relative cursor-pointer"
              style={{
                height: 'calc(100dvh - var(--spacing-nav-height) - 16rem)',
              }}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full rounded-md object-contain"
              >
                <source
                  src={desktopVideoUrl}
                  media="(min-width: 1024px)"
                  type="video/mp4"
                />
                <source src={mobileVideoUrl} type="video/mp4" />
              </video>
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 transition-colors group-hover:bg-black/20">
                <span className="rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </span>
              </div>
            </div>
          )}

          {!alreadyOnRoute && (
            <Button variant="primary" onClick={handleGo}>
              {routeLabel}
            </Button>
          )}
        </div>
      </Modal>

      {mobileVideoUrl && desktopVideoUrl && (
        <VideoLightbox
          mobileSrc={mobileVideoUrl}
          desktopSrc={desktopVideoUrl}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
