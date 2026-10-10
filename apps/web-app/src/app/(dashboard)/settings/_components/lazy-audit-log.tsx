"use client"

import { lazy, Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"

// Lazy-load sub-pages so they render inline in the settings content area
const AuditLogPage = lazy(() => import("../audit-log/page"))

function LazyFallback() {
  return (
    <div className="space-y-4 p-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

// Strip the outer page wrapper when rendering inline — override backgrounds and padding
function EmbeddedPage({ children }: { children: React.ReactNode }) {
  return <div className="[&>div]:min-h-0 [&>div]:bg-transparent [&>div]:p-0 [&>div>div]:p-0 [&>div>div]:max-w-none">{children}</div>
}

export function LazyAuditLog() { return <Suspense fallback={<LazyFallback />}><EmbeddedPage><AuditLogPage /></EmbeddedPage></Suspense> }
