'use client';

import { useOnboardingStore } from '@/app/store/onboarding';
import {
  TOUR_ITEMS,
  type TourItemId,
} from '@/app/components/onboarding/tourConfig';
import { getRecentSets } from '@/app/store/recent-sets';

export function useOnboarding() {
  const {
    completedSteps,
    dismissed,
    collapsed,
    complete,
    dismiss,
    reEnable,
    collapse,
    expand,
    isComplete,
    progress,
  } = useOnboardingStore();

  const isStepComplete = (id: TourItemId): boolean =>
    completedSteps.includes(id);

  /** Resolve dynamic route for mark_piece (recent set or /search fallback) */
  const resolveRoute = (item: (typeof TOUR_ITEMS)[number]): string => {
    if (!item.dynamicRoute) return item.route;
    const recent = getRecentSets();
    if (recent.length > 0) {
      return `/sets/${recent[0].setNumber}`;
    }
    return '/search';
  };

  /** Resolve route label for mark_piece edge case */
  const resolveRouteLabel = (item: (typeof TOUR_ITEMS)[number]): string => {
    if (!item.dynamicRoute) return item.routeLabel;
    const recent = getRecentSets();
    return recent.length > 0 ? `Go to ${recent[0].setNumber}` : 'Go to Search';
  };

  return {
    completedSteps,
    dismissed,
    collapsed,
    complete,
    dismiss,
    reEnable,
    collapse,
    expand,
    isComplete,
    progress,
    isStepComplete,
    resolveRoute,
    resolveRouteLabel,
  };
}
