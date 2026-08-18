'use client';

import { NavbarSkeleton } from './primitives';
import { RouteSkeleton } from './route-skeleton';

// ============================================================================
// Main Dashboard Skeleton — shown during the initial auth check
// ============================================================================

/** Whole app shell: navbar placeholder plus the current route's own shape. */
export function DashboardSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-background animate-in fade-in duration-200">
      <NavbarSkeleton />
      <div className="flex-1 overflow-auto">
        <RouteSkeleton />
      </div>
    </div>
  );
}

// ============================================================================
// Page Content Skeleton — the dashboard layout's Suspense fallback
// ============================================================================

/** Inside the real shell (navbar already painted) — page content only. */
export function PageContentSkeleton() {
  return (
    <div className="h-full animate-in fade-in duration-200">
      <RouteSkeleton />
    </div>
  );
}
