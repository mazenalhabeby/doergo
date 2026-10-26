"use client"

import { SEG, segButton } from "@/components/attendance/time-styles"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Columns3, ListFilter, Radio } from "lucide-react"

import { employeesApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { useTimeFormat } from "@/hooks/use-time-format"
import { readStoredFloorView, storeFloorView, type FloorView } from "../_lib/floor-view"
import { keys } from "@/lib/query-keys"
import { LanesCard } from "./lanes-card"
import { ExceptionsCard } from "./exceptions-card"

/**
 * Who is on the floor right now.
 *
 * The half the old calendar could not answer, because it PLANNED — it drew the
 * rota and approved leave and called the result "available", which says nothing
 * about whether anybody turned up. This REPORTS.
 *
 * Two numbers, deliberately: DUE comes from the rota, HERE comes from the clock,
 * and the gap between them is the only actionable thing on the panel. A
 * workspace can satisfy its rota perfectly and still be short because somebody
 * called in sick this morning.
 *
 * Two layouts, because two people want different things from the same data —
 * see `_lib/floor-view.ts`. The choice is the reader's and is remembered.
 */
export function FloorNowPanel({ spaceFilter }: { spaceFilter: string }) {
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  // Initialised from storage the same way the tasks page does it — the reader is
  // its own single source, and it falls back to the default when there is no
  // browser or storage is unreadable.
  const [view, setView] = useState<FloorView>(readStoredFloorView)

  const choose = useCallback((v: FloorView) => {
    setView(v)
    storeFloorView(v)
  }, [])

  const readsFloor = useRouteAccess().holds("any:canViewSpaceAttendance")
  const { data: spaces = [], isLoading } = useQuery({
    queryKey: keys.attendance.floorNow(),
    queryFn: () => employeesApi.getFloorNow(),
    staleTime: 30_000,
    // @RequirePermissionInSpace('canViewSpaceAttendance') — asked only of whoever holds it.
    enabled: readsFloor,
    // A safety refetch, not the delivery mechanism: clock events already
    // invalidate this key over the socket. This is what heals a missed one.
    refetchInterval: 60_000,
  })

  const shown = useMemo(
    () =>
      (spaceFilter === "all" ? spaces : spaces.filter((s) => s.spaceId === spaceFilter)).filter((s) => s.people.length),
    [spaces, spaceFilter],
  )

  if (isLoading) {
    return (
      <div className="mb-4 rounded-[22px] border border-border bg-card p-4 shadow-shell">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (!shown.length) return null

  return (
    <section className="mb-4">
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-foreground">
          <Radio className="h-3.5 w-3.5 animate-pulse text-shell-accent" aria-hidden />
          {t("cover.floorNow.title", "On the floor right now")}
        </h2>

        <div className={SEG} role="group" aria-label={t("cover.floorNow.viewLabel", "Layout")}>
          {(
            [
              ["exceptions", ListFilter, t("cover.floorNow.viewExceptions", "Only what needs you")],
              ["lanes", Columns3, t("cover.floorNow.viewLanes", "Everyone, grouped")],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => choose(v)}
              title={label}
              className={segButton(view === v)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {shown.map((space) =>
          view === "lanes" ? (
            <LanesCard key={space.spaceId} space={space} formatTime={formatTime} />
          ) : (
            <ExceptionsCard key={space.spaceId} space={space} formatTime={formatTime} />
          ),
        )}
      </div>
    </section>
  )
}
