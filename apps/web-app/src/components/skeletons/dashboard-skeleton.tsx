"use client"

import { RouteSkeleton } from "./route-skeleton"

// ============================================================================
// Page Content Skeleton — the dashboard layout's Suspense fallback
// ============================================================================

/** Inside the real shell (navbar already painted) — page content only. */
export function PageContentSkeleton() {
  return <RouteSkeleton />
}
