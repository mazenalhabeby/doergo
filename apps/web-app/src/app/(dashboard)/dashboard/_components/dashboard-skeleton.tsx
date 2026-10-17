"use client"

import { getSpaceScope } from "@hbcfield/shared/client"

import { WORKSPACE_CARD, workspaceCardCols } from "@/components/dashboard"
import { Shimmer as S } from "@/components/skeletons/primitives"
import { cn } from "@/lib/utils"
import { PAGE_SHELL } from "@/components/ui/page-width";
import {
  CARD_SHAPE,
  CardSkeleton,
  ActivityRailSkeleton,
  HeaderSkeleton,
  type DashboardPageSkeletonProps,
} from "./activity-rail-skeleton";
export { dashboardVariant } from "./activity-rail-skeleton";

/**
 * Loading state for /dashboard — a structural stand-in, not a generic grey box.
 *
 * Distinct from `components/skeletons`' DashboardSkeleton, which stands in for
 * the whole app shell (navbar included) during the auth check. This one renders
 * INSIDE that shell, in place of the dashboard page itself.
 *
 * It mirrors the real screen closely enough that nothing shifts when the data
 * lands: same header row, same `max-w-[1440px]` content column, cards laid out
 * by the SAME geometry the live grid uses (WORKSPACE_CARD / workspaceCardWidth),
 * and the same 300px activity rail split into Recent Activity and Pending
 * Actions.
 *
 * The card sizes are a fixed, hand-picked distribution rather than random: a
 * random layout would differ between server render and hydration, and would
 * also reshuffle on every re-render. Movement comes from a shimmer sweep and a
 * staggered rise-in instead, both disabled under prefers-reduced-motion.
 */
export function DashboardPageSkeleton({ variant = "spaces" }: DashboardPageSkeletonProps) {
  // Task-only member: a single narrow column — contacts above their task list,
  // no space grid and no activity rail.
  if (variant === "tasks") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div>
          <S className="h-3 w-28 rounded" />
          <S className="mb-6 mt-2 h-7 w-56 rounded-lg" />
        </div>

        {/* Management contacts */}
        <div className="mb-6 space-y-2.5">
          <S className="h-3 w-24 rounded" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-3 animate-in fade-in fill-mode-backwards duration-500 motion-reduce:animate-none"
              style={{ animationDelay: `${80 + i * 70}ms` }}
            >
              <S className="h-9 w-9 rounded-full shrink-0" delayMs={i * 70} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <S className="h-2.5 w-2/5 rounded" delayMs={i * 70} />
                <S className="h-2 w-1/4 rounded" delayMs={i * 70} />
              </div>
              <S className="h-8 w-8 rounded-lg shrink-0" delayMs={i * 70} />
              <S className="h-8 w-8 rounded-lg shrink-0" delayMs={i * 70} />
            </div>
          ))}
        </div>

        {/* My tasks */}
        <div className="mb-3 flex items-center justify-between">
          <S className="h-3 w-20 rounded" />
          <S className="h-3 w-14 rounded" />
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-2 divide-y divide-border/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="py-3 space-y-2 animate-in fade-in fill-mode-backwards duration-500 motion-reduce:animate-none"
              style={{ animationDelay: `${220 + i * 60}ms` }}
            >
              <S className="h-2.5 rounded" style={{ width: `${58 + (i % 4) * 9}%` }} delayMs={i * 60} />
              <div className="flex gap-2">
                <S className="h-4 w-16 rounded-full" delayMs={i * 60} />
                <S className="h-4 w-12 rounded-full" delayMs={i * 60} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "employee") {
    return (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <HeaderSkeleton />
          <div className={PAGE_SHELL}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
              <section>
                <S className="mb-3 h-3 w-24 rounded" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: WORKSPACE_CARD.GRID_GAP }}>
                  {CARD_SHAPE.slice(0, 3).map((nodes, i) => (
                    <CardSkeleton key={i} nodes={nodes} index={i} />
                  ))}
                </div>
              </section>
              <div className="space-y-6">
                {/* Management contacts card */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <S className="h-3 w-32 rounded" />
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <S className="h-9 w-9 rounded-full shrink-0" delayMs={i * 70} />
                      <div className="flex-1 space-y-1.5">
                        <S className="h-2.5 w-1/2 rounded" delayMs={i * 70} />
                        <S className="h-2 w-1/3 rounded" delayMs={i * 70} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* My tasks */}
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <S className="h-3 w-20 rounded" />
                    <S className="h-3 w-14 rounded" />
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-2 divide-y divide-border/60">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="py-3 space-y-2 animate-in fade-in fill-mode-backwards duration-500 motion-reduce:animate-none"
                        style={{ animationDelay: `${150 + i * 60}ms` }}
                      >
                        <S className="h-2.5 w-3/4 rounded" delayMs={i * 60} />
                        <div className="flex gap-2">
                          <S className="h-4 w-16 rounded-full" delayMs={i * 60} />
                          <S className="h-4 w-12 rounded-full" delayMs={i * 60} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
        <ActivityRailSkeleton />
      </div>
    )
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <HeaderSkeleton centered />
        <div className={PAGE_SHELL}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: WORKSPACE_CARD.GRID_GAP }}>
            {CARD_SHAPE.map((nodes, i) => (
              <CardSkeleton key={i} nodes={nodes} index={i} />
            ))}
          </div>
        </div>
      </div>
      <ActivityRailSkeleton />
    </div>
  )
}
