import { Shimmer as S } from "./primitives"
import { cn } from "@/lib/utils"

/*
  The task page's own loading shape — the page draws it while the task loads, and RouteSkeleton draws it for
  the route, so the two stages are one silhouette.
*/
const PAGE_OUTER = "min-h-full bg-background"

/** Card skeleton */
function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4">
      <S className="h-5 w-32 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <S key={i} className={cn("h-4 rounded", i === 0 ? "w-full" : i === 1 ? "w-3/4" : "w-1/2")} />
      ))}
    </div>
  )
}

/** Task detail page */
export function TaskDetailPageSkeleton() {
  return (
    <div className={PAGE_OUTER}>
      {/* max-w-7xl and p-8 match the real page — a 6xl skeleton shifted the
          whole column sideways the moment the task arrived. */}
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Back + title row */}
        <div className="flex items-center gap-3">
          <S className="h-9 w-9 rounded-lg" />
          <S className="h-8 w-56 rounded-lg" />
          <S className="h-6 w-20 rounded-full ml-2" />
          <div className="ml-auto flex gap-2">
            <S className="h-11 w-28 rounded-xl" />
            <S className="h-11 w-11 rounded-xl" />
          </div>
        </div>
        {/* Progress card */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <S className="w-9 h-9 rounded-full" />
                <S className="w-20 h-3.5 rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* 60/40 split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={3} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <CardSkeleton lines={8} />
          </div>
        </div>
      </div>
    </div>
  )
}
