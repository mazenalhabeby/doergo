'use client';

import { usePathname } from 'next/navigation';

import { DashboardPageSkeleton, dashboardVariant } from '@/app/(dashboard)/dashboard/_components/dashboard-skeleton';
import { useAuth } from '@/contexts/auth-context';

import { GenericContentSkeleton } from './primitives';

/**
 * The page-shaped skeleton for the current route.
 *
 * Loading a dashboard page passes through up to three placeholder stages — the
 * auth check, the layout's Suspense boundary, then the route's own loading.tsx.
 * When the first two render a generic shape, the user watches the layout change
 * under them twice before the real page appears. Routing them all through this
 * one map means every stage shows the same silhouette, so the page only ever
 * fills in — it never re-arranges.
 *
 * Add a route here as its page gains a shaped skeleton; anything unmapped falls
 * back to the generic content blocks, which is the previous behaviour.
 */
export function RouteSkeleton() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === '/dashboard') {
    // The dashboard has three layouts; draw the one this user will actually get.
    // During the auth check `user` is still null and dashboardVariant falls back
    // to the admin grid.
    return <DashboardPageSkeleton variant={dashboardVariant(user)} />;
  }

  return <GenericContentSkeleton />;
}
