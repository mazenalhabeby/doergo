"use client"

import { useEffect, useMemo, useState } from "react"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  hasAccessModule,
  moduleAnywhere,
  resolveCrmCaps,
  type CalendarItem,
  type CalendarLayer,
  type DayKind,
} from "@hbcfield/shared/client"
import { AlertCircle, Plus } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { PageHeader, Notice } from "@/components/page/page-kit"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { SpaceTabs } from "@/components/spaces/space-tabs"
import { useSpaceScope } from "@/hooks/use-space-scope"
import { useScheduleAccess } from "@/hooks/use-schedule-access"
import { calendarApi } from "@/lib/api"

import { dateLocale } from "@/lib/format-date"
import { addDays, dayKey, daysFrom, isoWeek, monthGrid, startOfWeek } from "./_lib/layout"
import { linkedDay, useCalendarRange, useLayers, useStoredView } from "./_lib/use-calendar"
import { WeekGrid } from "./_components/week-grid"
import { MonthGrid } from "./_components/month-grid"
import { AgendaList } from "./_components/agenda-list"
import { ItemPopover } from "./_components/item-popover"
import { Rail } from "./_components/rail"
import { CalendarToolbar, PlacesLine } from "./_components/calendar-toolbar"
import { keys } from "@/lib/query-keys"
import dynamic from "next/dynamic"
import { useLatched } from "@/hooks/use-latched"

// Both dialogs open on a click; they are downloaded the first time one opens.
const EventDialog = dynamic(() => import("./_components/event-dialog").then((m) => m.EventDialog), { ssr: false })
const CreateTaskDialog = dynamic(
  () => import("../../../components/tasks/create-task-dialog").then((m) => m.CreateTaskDialog),
  { ssr: false },
)

/**
 * The organization's own calendar.
 *
 * One read per window (every layer the member may see, filtered on the server), drawn four ways —
 * day, week, month, agenda — plus a link to the Schedule (the team board) for whoever may open it.
 * "My calendar" is the member's own days (their workspaces' weekends and holidays, their rota);
 * picking a workspace shows that place's days and, for a leader, the team's leave.
 */
export default function CalendarPage() {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useStoredView()
  useEffect(() => {
    const d = linkedDay()?.date
    if (d) setAnchor(d)
  }, [])
  const { layers, toggle } = useLayers()
  const { spaces, spaceId, setSpaceId } = useSpaceScope({ allowAll: true })
  const [selected, setSelected] = useState<{ item: CalendarItem; el: HTMLElement } | null>(null)
  const [dialog, setDialog] = useState<{ start?: Date | null; eventId?: string | null } | null>(null)
  const dialogMounted = useLatched(!!dialog)
  const [jobAt, setJobAt] = useState<Date | null>(null)
  const jobMounted = useLatched(!!jobAt)
  const router = useRouter()

  const days = useMemo(() => {
    if (view === "day") return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())]
    if (view === "week") return daysFrom(startOfWeek(anchor), 7)
    if (view === "month") return monthGrid(anchor)
    return daysFrom(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), 14)
  }, [anchor, view])
  const from = dayKey(days[0]!),
    to = dayKey(days[days.length - 1]!)

  const { data, isLoading, isError, refetch } = useCalendarRange({ from, to, spaceId, layers })
  const items = useMemo(() => (layers.length ? (data?.items ?? []) : []), [data, layers])
  const dayKinds = useMemo(() => new Map<string, DayKind>((data?.days ?? []).map((d) => [d.day, d.kind])), [data])
  const holidayKeys = useMemo(() => {
    const s = new Set<string>()
    for (const i of items)
      if (i.kind === "holiday")
        for (let d = i.start; d <= i.end; d = dayKey(addDays(new Date(`${d}T12:00:00`), 1))) s.add(d)
    return s
  }, [items])
  const counts = useMemo(() => {
    const c: Partial<Record<CalendarLayer, number>> = {}
    for (const i of items) c[i.layer] = (c[i.layer] ?? 0) + 1
    return c
  }, [items])
  const today = dayKey(new Date())
  const offToday = useMemo(
    () => items.filter((i) => i.kind === "leave" && i.start <= today && i.end >= today),
    [items, today],
  )

  const editing = useQuery({
    queryKey: keys.calendar.event(dialog?.eventId),
    queryFn: () => calendarApi.event(dialog!.eventId!),
    enabled: !!dialog?.eventId,
  })

  const step = (dir: -1 | 1) => {
    if (view === "day") setAnchor(addDays(anchor, dir))
    else if (view === "week") setAnchor(addDays(anchor, 7 * dir))
    else if (view === "agenda") setAnchor(addDays(anchor, 14 * dir))
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
  }

  const heading = useMemo(() => {
    const loc = dateLocale()
    if (view === "month") return anchor.toLocaleDateString(loc, { month: "long", year: "numeric" })
    if (view === "day") return anchor.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })
    const a = days[0]!,
      b = days[days.length - 1]!
    const sameMonth = a.getMonth() === b.getMonth()
    return `${a.toLocaleDateString(loc, {
      day: "numeric",
      ...(sameMonth ? {} : { month: "short" }),
    })} – ${b.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" })}`
  }, [anchor, days, view])

  const week = view === "week" ? isoWeek(anchor) : null
  // The Team button opens the Schedule, so it asks what the Schedule asks (permission AND the bought Option).
  const scheduleAccess = useScheduleAccess()
  // Deciding a leave is the same permission the approve route asks; the server still narrows it to the people they lead.
  const canDecideLeave = user?.role === "ADMIN" || hasPermission("canManageRota")
  // What New may offer — each the same gate the server asks (it refuses the rest anyway).
  const crm =
    !!user &&
    moduleAnywhere(user, "crm") &&
    resolveCrmCaps(String(user.role), (user as { access?: { org?: unknown } }).access?.org as never).canAccess
  const canNewJob = user?.role === "ADMIN" || hasPermission("canCreateTasks")
  const canTimeOff = !!user && hasAccessModule(user, "time_off")
  const offices = spaces.map((s) => ({ id: s.id, name: s.name }))
  const select = (item: CalendarItem, el: HTMLElement) => setSelected({ item, el })

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={t("nav.sidebar.calendar")}
        subtitle={t("calendar.pageSubtitle")}
        actions={
          <Button size="pill" onClick={() => setDialog({ start: null })}>
            <Plus />
            {t("calendar.new")}
          </Button>
        }
      />
      {spaces.length > 0 && (
        <SpaceTabs
          spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
          value={spaceId}
          onChange={setSpaceId}
          allLabel={t("calendar.myCalendar")}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          <Rail
            anchor={anchor}
            setAnchor={setAnchor}
            visibleKeys={new Set(view === "month" ? [] : days.map(dayKey))}
            layers={layers}
            toggleLayer={toggle}
            counts={counts}
            dayKinds={dayKinds}
            holidayKeys={holidayKeys}
            offToday={offToday}
          />
        </div>

        <main className="order-1 min-w-0 space-y-3.5 lg:order-2">
          <CalendarToolbar
            heading={heading}
            week={week}
            view={view}
            setView={setView}
            step={step}
            onToday={() => setAnchor(new Date())}
            scheduleHref={scheduleAccess ? (spaceId ? `/schedule?space=${spaceId}` : "/schedule") : null}
          />
          {data?.places && data.places.length > 0 && <PlacesLine places={data.places} />}

          {isError ? (
            <Notice tone="crit" className="mb-0">
              <AlertCircle />
              {t("calendar.loadError")}
              <Button size="sm" variant="outline" className="ml-auto rounded-full" onClick={() => refetch()}>
                {t("common.retry", "Retry")}
              </Button>
            </Notice>
          ) : !data && isLoading && layers.length ? (
            <div className="h-[640px] animate-pulse rounded-[22px] border border-border bg-card shadow-shell" />
          ) : view === "month" ? (
            <MonthGrid
              anchor={anchor}
              days={days}
              items={items}
              dayKinds={dayKinds}
              onSelect={select}
              onOpenDay={(d) => {
                setAnchor(d)
                setView("day")
              }}
            />
          ) : view === "agenda" ? (
            <AgendaList days={days} items={items} dayKinds={dayKinds} onSelect={select} />
          ) : (
            <WeekGrid
              days={days}
              items={items}
              dayKinds={dayKinds}
              selectedId={selected?.item.id ?? null}
              onSelect={select}
              onCreateAt={(start) => setDialog({ start })}
            />
          )}
        </main>
      </div>

      <ItemPopover
        item={selected?.item ?? null}
        anchor={selected?.el ?? null}
        myId={user?.id}
        canDecideLeave={canDecideLeave}
        scheduleAccess={scheduleAccess}
        onClose={() => setSelected(null)}
        onEdit={(id) => setDialog({ eventId: id })}
      />
      {dialogMounted && (
        <EventDialog
          open={!!dialog && (!dialog.eventId || !!editing.data)}
          onOpenChange={(o) => !o && setDialog(null)}
          start={dialog?.start ?? null}
          event={dialog?.eventId ? (editing.data ?? null) : null}
          spaceId={spaceId}
          offices={offices}
          crm={crm}
          onNewJob={canNewJob ? (at) => setJobAt(at) : undefined}
          onTimeOff={canTimeOff ? (day) => router.push(`/my/time-off?from=${day}`) : undefined}
        />
      )}
      {canNewJob && jobMounted && (
        <CreateTaskDialog
          open={!!jobAt}
          onOpenChange={(o) => {
            if (!o) setJobAt(null)
          }}
          defaultSpaceId={spaceId ?? null}
          defaultDueDate={jobAt}
        />
      )}
    </div>
  )
}
