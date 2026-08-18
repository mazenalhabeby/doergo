"use client"

import { getSpaceScope } from "@hbcfield/shared/client"

import { WORKSPACE_CARD, workspaceCardCols } from "@/components/dashboard"
import { Shimmer as S } from "@/components/skeletons/primitives"
import { cn } from "@/lib/utils"

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

/**
 * Which layout this user's dashboard renders. Shared by the page and its
 * skeleton so the placeholder always matches the screen that follows it.
 * `user` may be null (auth still resolving) — the admin grid is the default.
 */
export function dashboardVariant(
  user: { role?: string; canViewAllTasks?: boolean; enabledModules?: unknown } | null | undefined,
): DashboardPageSkeletonProps["variant"] {
  if (!user) return "spaces"
  if (user.role === "ADMIN" || user.canViewAllTasks) return "spaces"
  return getSpaceScope(user) === "tasks" ? "tasks" : "employee"
}

/** Person-node counts per card — a realistic mix of team sizes, biggest first,
 *  matching how the live grid sorts (busy spaces first, quiet ones last). */
const CARD_SHAPE = [4, 2, 3, 1, 2, 1, 1, 4, 1, 1, 2, 1, 1, 1]

/** Word-widths for activity lines, so the feed doesn't read as identical bars. */
const ACTIVITY_LINES = [
  ["82%", "38%"],
  ["66%", "44%"],
  ["91%", "31%"],
  ["58%", "47%"],
  ["76%", "35%"],
  ["88%", "41%"],
  ["61%", "29%"],
]

/** One workspace card, laid out by the same CSS the live card uses. */
function CardSkeleton({ nodes, index }: { nodes: number; index: number }) {
  return (
    <div
      className={cn(
        "ws-card rounded-xl bg-card border border-border flex flex-col",
        "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500",
        "motion-reduce:animate-none",
      )}
      style={{
        // Same two inputs the real card gives the stylesheet, so the placeholder
        // is the exact width the data will land in.
        ["--ws-cols" as string]: String(workspaceCardCols(nodes)),
        minHeight: WORKSPACE_CARD.MIN_H,
        flexShrink: 0,
        // Cards rise in one after another — the page fills rather than appears.
        animationDelay: `${index * 45}ms`,
      }}
    >
      {/* Title row: name on the left, x/y count on the right */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0">
        <S className="h-2.5 rounded" style={{ width: 44 + (index % 4) * 14 }} delayMs={index * 45} />
        <S className="h-2.5 w-6 rounded ml-auto" delayMs={index * 45} />
      </div>

      {/* Person nodes on the card's own column grid — same class, same widths */}
      <div className="flex-1 flex flex-col justify-center gap-2 p-3">
        <div className="ws-card-nodes">
          {Array.from({ length: nodes }).map((_, j) => (
            <div key={j} className="ws-node flex flex-col items-center gap-1.5">
              <S className="h-11 w-11 rounded-full" delayMs={index * 45 + j * 70} />
              <S className="h-2 w-12 rounded" delayMs={index * 45 + j * 70} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The 300px right rail: Recent Activity over Pending Actions. */
function ActivityRailSkeleton() {
  return (
    <div className="w-[300px] border-l border-border bg-background/80 backdrop-blur-xl flex flex-col overflow-hidden shrink-0">
      {/* Recent Activity — flex-[2], same as the live panel */}
      <div className="flex-[2] flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-foreground/[0.03]">
          <S className="h-2.5 w-24 rounded" />
          <S className="h-4 w-14 rounded-full" />
        </div>
        <div className="flex-1 overflow-hidden">
          {ACTIVITY_LINES.map(([wide, narrow], i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 animate-in fade-in fill-mode-backwards duration-500 motion-reduce:animate-none"
              style={{ animationDelay: `${120 + i * 60}ms` }}
            >
              <S className="h-2 w-2 rounded-full shrink-0 mt-1.5" delayMs={i * 60} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <S className="h-2.5 rounded" style={{ width: wide }} delayMs={i * 60} />
                <S className="h-2 rounded" style={{ width: narrow }} delayMs={i * 60} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Actions — flex-1 */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-foreground/[0.03]">
          <S className="h-2.5 w-28 rounded" />
          <S className="h-4 w-6 rounded-full" />
        </div>
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 animate-in fade-in fill-mode-backwards duration-500 motion-reduce:animate-none"
              style={{ animationDelay: `${320 + i * 60}ms` }}
            >
              <S className="h-8 w-8 rounded-full shrink-0" delayMs={i * 60} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <S className="h-2.5 w-4/5 rounded" delayMs={i * 60} />
                <S className="h-2 w-1/2 rounded" delayMs={i * 60} />
              </div>
              <S className="h-4 w-4 rounded shrink-0" delayMs={i * 60} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Greeting + title on the left, actions on the right — the live header row. */
function HeaderSkeleton({ centered }: { centered?: boolean }) {
  return (
    <div className="flex items-start justify-between px-6 pt-6">
      <div style={centered ? { paddingLeft: "max(0px, calc((100% - 1440px) / 2))" } : undefined}>
        <S className="h-3 w-28 rounded" />
        <S className="mt-2 h-7 w-64 rounded-lg" />
      </div>
      <div className="flex items-center gap-2">
        <S className="h-8 w-28 rounded-lg" />
        <S className="h-8 w-8 rounded-lg" />
      </div>
    </div>
  )
}

export interface DashboardPageSkeletonProps {
  /**
   * Which of the dashboard's layouts to stand in for. They differ structurally,
   * so a single skeleton would guarantee a jump for two of the three.
   *
   * "spaces"   — admin / manager: full-width space grid + activity rail
   * "employee" — member with spaces: spaces left, contacts + my tasks right
   * "tasks"    — member scoped to tasks only: narrow centred column, no rail
   */
  variant?: "spaces" | "employee" | "tasks"
}

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
          <div className="max-w-[1440px] mx-auto px-6 py-6">
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
        <div className="max-w-[1440px] mx-auto px-6 py-6">
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
