'use client';

import { usePathname } from 'next/navigation';
import { ClientRecordSkeleton, ClientsListSkeleton } from './crm';

import { DashboardPageSkeleton, dashboardVariant } from '@/app/(dashboard)/dashboard/_components/dashboard-skeleton';
import { TasksPageLoading } from '@/app/(dashboard)/tasks/_components/tasks-skeleton';
import { TaskDetailPageSkeleton } from './page-skeletons';
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

  // A task detail route — /tasks/<id>, but not /tasks/recurring.
  if (pathname.startsWith('/tasks/') && pathname !== '/tasks/recurring') {
    return <TaskDetailPageSkeleton />;
  }

  if (pathname === '/tasks') {
    // Draws the view the user left the list in, so the auth check, the Suspense
    // boundary and the route loader all show the same shape.
    return <TasksPageLoading />;
  }

  if (pathname === '/dashboard') {
    // The dashboard has three layouts; draw the one this user will actually get.
    // During the auth check `user` is still null and dashboardVariant falls back
    // to the admin grid.
    return <DashboardPageSkeleton variant={dashboardVariant(user)} />;
  }

  /*
    The CRM — but only once we know whose CRM it is.

    ⚠️ These routes are MODULE-GATED. Clients, assets and portals exist for an
    organization only while the module is on, so during the auth check — when
    `user` is still null — drawing the clients list would be promising a page
    that may never be rendered for this account at all. The neutral shape below
    is the honest answer until the user is known; after that this is a real
    navigation to a route the app has already decided to render.
  */
  if (user) {
    if (pathname.startsWith('/customers/')) return <ClientRecordSkeleton />;
    if (pathname === '/clients') return <ClientsListSkeleton />;
  }

  return <GenericContentSkeleton />;
}
