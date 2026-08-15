"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { addDays, format, startOfWeek } from "date-fns"
import { AlertTriangle, Plus, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2, Loader2, User, Users } from "lucide-react"

import { notify } from "@/lib/toast"
import {
  rotaApi,
  shiftsApi,
  employeesApi,
  spaceMembersApi,
  type CreateRotaInput,
} from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { type ShiftAssignment, ShiftRecurrence } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SectionHeader, EmptyState } from "./section-header"

const RECURRENCES: ShiftRecurrence[] = [
  ShiftRecurrence.DAILY,
  ShiftRecurrence.WEEKLY,
  ShiftRecurrence.MONTHLY,
  ShiftRecurrence.ONE_OFF,
]

// Semantic accent per recurrence type (light + dark tokens, no raw hex).
const RECURRENCE_BADGE: Record<ShiftRecurrence, string> = {
  [ShiftRecurrence.DAILY]:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  [ShiftRecurrence.WEEKLY]:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  [ShiftRecurrence.MONTHLY]:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  [ShiftRecurrence.ONE_OFF]:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

// 0=Sun..6=Sat to match backend daysOfWeek.
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

/**
 * Does an assignment apply on a given calendar day? Resolves the recurrence
 * against the effective window. Date comparisons are done on yyyy-MM-dd strings
 * to sidestep timezone drift (matches how the day is displayed to the admin).
 */
function assignmentAppliesOn(a: ShiftAssignment, day: Date, dayStr: string): boolean {
  const from = a.effectiveFrom?.slice(0, 10)
  const to = a.effectiveTo?.slice(0, 10)
  if (from && dayStr < from) return false
  if (to && dayStr > to) return false
  switch (a.recurrence) {
    case ShiftRecurrence.DAILY:
      return true
    case ShiftRecurrence.WEEKLY:
      return a.daysOfWeek?.includes(day.getDay()) ?? false
    case ShiftRecurrence.MONTHLY:
      return a.daysOfMonth?.includes(day.getDate()) ?? false
    case ShiftRecurrence.ONE_OFF:
      return a.dates?.some((d) => d.slice(0, 10) === dayStr) ?? false
    default:
      return false
  }
}

/** "HH:MM" → minutes since midnight. */
function hhmmToMin(hhmm?: string): number {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** A shift's [start, end) window in minutes; night shifts extend past 1440. */
function shiftWindow(shift?: { startLocal: string; endLocal: string; crossesMidnight?: boolean }): [number, number] {
  if (!shift) return [0, 0]
  const s = hhmmToMin(shift.startLocal)
  let e = hhmmToMin(shift.endLocal)
  if (shift.crossesMidnight || e <= s) e += 1440
  return [s, e]
}

/** Do any two of a day's assignments have overlapping shift times? */
function cellHasConflict(cell: ShiftAssignment[]): boolean {
  for (let i = 0; i < cell.length; i++) {
    for (let j = i + 1; j < cell.length; j++) {
      const [s1, e1] = shiftWindow(cell[i].shift)
      const [s2, e2] = shiftWindow(cell[j].shift)
      if (s1 < e2 && s2 < e1) return true
    }
  }
  return false
}

export function RotaTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ShiftAssignment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShiftAssignment | null>(null)

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["rota", spaceId],
    queryFn: () => rotaApi.list(spaceId),
    staleTime: 30_000,
  })
  // Space members — to surface who works "open hours" (no shift assigned).
  const { data: spaceMembers } = useQuery({
    queryKey: ["space-members", spaceId],
    queryFn: () => spaceMembersApi.list(spaceId),
    staleTime: 30_000,
  })

  // Week navigator (weeks start Monday).
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const dayStrs = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days])
  const todayStr = format(new Date(), "yyyy-MM-dd")

  // Scheduled members = anyone with an assignment (deduped, name-sorted).
  const scheduledMembers = useMemo(() => {
    const map = new Map<string, { id: string; first: string; last: string }>()
    for (const a of assignments ?? []) {
      if (a.user && !map.has(a.userId)) {
        map.set(a.userId, { id: a.userId, first: a.user.firstName, last: a.user.lastName })
      }
    }
    return [...map.values()].sort((x, y) => `${x.first} ${x.last}`.localeCompare(`${y.first} ${y.last}`))
  }, [assignments])

  // Open-hours members = space members not on the rota.
  const openMembers = useMemo(() => {
    const scheduledIds = new Set(scheduledMembers.map((m) => m.id))
    return (spaceMembers ?? [])
      .filter((m) => m.user && !scheduledIds.has(m.userId))
      .map((m) => ({ id: m.userId, first: m.user!.firstName, last: m.user!.lastName }))
      .sort((x, y) => `${x.first} ${x.last}`.localeCompare(`${y.first} ${y.last}`))
  }, [spaceMembers, scheduledMembers])

  // Index assignments by member once, so a cell filters only that member's
  // slice instead of re-scanning the whole array members×7 times per render.
  const byUser = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>()
    for (const a of assignments ?? []) {
      const arr = map.get(a.userId)
      if (arr) arr.push(a)
      else map.set(a.userId, [a])
    }
    return map
  }, [assignments])

  const cellFor = (userId: string, day: Date, dayStr: string) =>
    (byUser.get(userId) ?? []).filter((a) => assignmentAppliesOn(a, day, dayStr))

  // Count double-booked cells in the visible week (overlapping shift times).
  const weekConflicts = useMemo(() => {
    let n = 0
    for (const m of scheduledMembers) {
      for (let i = 0; i < days.length; i++) {
        if (cellHasConflict(cellFor(m.id, days[i], dayStrs[i]))) n++
      }
    }
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledMembers, days, dayStrs, byUser])

  const removeMutation = useMutation({
    mutationFn: (id: string) => rotaApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rota", spaceId] })
      setDeleteTarget(null)
      notify.success(t("scheduling.rota.toast.deleted"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.rota.toast.deleteFailed")),
  })

  const recurrenceSummary = (a: ShiftAssignment): string => {
    switch (a.recurrence) {
      case ShiftRecurrence.DAILY:
        return t("scheduling.rota.recurrence.dailySummary")
      case ShiftRecurrence.WEEKLY:
        return a.daysOfWeek?.length
          ? a.daysOfWeek
              .slice()
              .sort((x, y) => x - y)
              .map((d) => t(`scheduling.rota.weekdaysShort.${WEEKDAY_KEYS[d]}`))
              .join(", ")
          : t("scheduling.rota.recurrence.weekly")
      case ShiftRecurrence.MONTHLY:
        return a.daysOfMonth?.length
          ? t("scheduling.rota.recurrence.monthlySummary", { days: a.daysOfMonth.slice().sort((x, y) => x - y).join(", ") })
          : t("scheduling.rota.recurrence.monthly")
      case ShiftRecurrence.ONE_OFF:
        return t("scheduling.rota.recurrence.oneOffSummary", { count: a.dates?.length || 0 })
      default:
        return ""
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarDays}
        accent="sky"
        title={t("scheduling.rota.heading")}
        description={t("scheduling.rota.intro")}
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("scheduling.rota.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !assignments || assignments.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("scheduling.rota.empty.title")}
          description={t("scheduling.rota.empty.description")}
          action={
            <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("scheduling.rota.new")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* Week navigator */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-2 text-sm font-medium text-foreground">
                {format(days[0], "MMM d")} – {format(days[6], "MMM d")}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              {t("scheduling.rota.grid.thisWeek")}
            </Button>
          </div>

          {/* Conflict summary — overlapping shifts in the visible week */}
          {weekConflicts > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("scheduling.rota.grid.conflictSummary", { count: weekConflicts })}
            </div>
          )}

          {/* Weekly grid: scheduled members × days */}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-xs font-semibold text-muted-foreground min-w-[140px]">
                    {t("scheduling.rota.grid.member")}
                  </th>
                  {days.map((d, i) => (
                    <th
                      key={dayStrs[i]}
                      className={cn(
                        "px-2 py-2 text-center text-xs font-semibold min-w-[92px]",
                        dayStrs[i] === todayStr ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground",
                      )}
                    >
                      <div>{t(`scheduling.rota.weekdaysShort.${WEEKDAY_KEYS[d.getDay()]}`)}</div>
                      <div className="text-[11px] font-normal">{format(d, "d")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduledMembers.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2">
                      <div className="flex items-center gap-2">
                        <UserAvatar firstName={m.first} lastName={m.last} seed={m.id} size="sm" />
                        <span className="text-sm font-medium text-foreground truncate">{m.first} {m.last}</span>
                      </div>
                    </td>
                    {days.map((d, i) => {
                      const cell = cellFor(m.id, d, dayStrs[i])
                      const conflict = cellHasConflict(cell)
                      return (
                        <td
                          key={dayStrs[i]}
                          title={conflict ? t("scheduling.rota.grid.conflictCell") : undefined}
                          className={cn(
                            "px-1.5 py-1.5 align-top text-center",
                            dayStrs[i] === todayStr && "bg-blue-50/50 dark:bg-blue-950/20",
                            conflict && "rounded-md ring-1 ring-inset ring-amber-400 dark:ring-amber-600",
                          )}
                        >
                          <div className="flex flex-col items-stretch gap-1">
                            {conflict && (
                              <span className="inline-flex items-center justify-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                {t("scheduling.rota.grid.conflictLabel")}
                              </span>
                            )}
                            {cell.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                title={a.shift ? `${a.shift.startLocal}–${a.shift.endLocal}` : undefined}
                                onClick={() => { setEditTarget(a); setDialogOpen(true) }}
                                className="rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight truncate transition-opacity hover:opacity-80"
                                style={{
                                  backgroundColor: `${a.shift?.color || "#2563eb"}22`,
                                  color: a.shift?.color || "#2563eb",
                                }}
                              >
                                {a.shift?.name || t("scheduling.rota.unknownShift")}
                              </button>
                            ))}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Open hours — space members without a shift assigned */}
          {openMembers.length > 0 && (
            <div className="rounded-xl border border-dashed bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{t("scheduling.rota.grid.openHoursTitle")}</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t("scheduling.rota.grid.openHoursHint")}</p>
              <div className="flex flex-wrap gap-2">
                {openMembers.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs">
                    <UserAvatar firstName={m.first} lastName={m.last} seed={m.id} size="sm" />
                    {m.first} {m.last}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assignments — manage (edit / delete) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("scheduling.rota.grid.allAssignments")}
            </p>
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: `${a.shift?.color || "#2563eb"}20` }}
                >
                  <User className="h-4 w-4" style={{ color: a.shift?.color || "#2563eb" }} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {a.user ? `${a.user.firstName} ${a.user.lastName}` : t("scheduling.rota.unknownMember")}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-sm text-muted-foreground truncate">
                      {a.shift?.name || t("scheduling.rota.unknownShift")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Badge variant="outline" className={cn("text-[11px]", RECURRENCE_BADGE[a.recurrence])}>
                      {t(`scheduling.rota.recurrence.${a.recurrence}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">{recurrenceSummary(a)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.priority > 0 && (
                  <Badge variant="secondary" className="text-[11px]">
                    {t("scheduling.rota.priorityBadge", { value: a.priority })}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditTarget(a); setDialogOpen(true) }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-600"
                  onClick={() => setDeleteTarget(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {dialogOpen && (
        <RotaDialog
          spaceId={spaceId}
          assignment={editTarget}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduling.rota.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("scheduling.rota.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); if (deleteTarget) removeMutation.mutate(deleteTarget.id) }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Rota create/edit dialog ─────────────────────────────────────────────────

function RotaDialog({
  spaceId,
  assignment,
  open,
  onOpenChange,
}: {
  spaceId: string
  assignment: ShiftAssignment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!assignment

  const [userId, setUserId] = useState(assignment?.userId || "")
  const [shiftId, setShiftId] = useState(assignment?.shiftId || "")
  const [recurrence, setRecurrence] = useState<ShiftRecurrence>(assignment?.recurrence || ShiftRecurrence.WEEKLY)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(assignment?.daysOfWeek || [1, 2, 3, 4, 5])
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>(assignment?.daysOfMonth || [])
  const [dates, setDates] = useState<string[]>(assignment?.dates || [])
  const [dateInput, setDateInput] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState(assignment?.effectiveFrom?.slice(0, 10) || "")
  const [effectiveTo, setEffectiveTo] = useState(assignment?.effectiveTo?.slice(0, 10) || "")
  const [priority, setPriority] = useState(String(assignment?.priority ?? 0))

  const { data: employeeData } = useQuery({
    queryKey: ["employees-for-rota"],
    queryFn: () => employeesApi.list({ limit: 100, status: "active" }),
  })
  const { data: shifts } = useQuery({
    queryKey: ["shifts", spaceId],
    queryFn: () => shiftsApi.list(spaceId),
  })

  const employees = employeeData?.data || []
  const activeShifts = (shifts || []).filter((s) => s.isActive)

  const mutation = useMutation({
    mutationFn: (data: CreateRotaInput) =>
      isEdit ? rotaApi.update(assignment!.id, data) : rotaApi.create(spaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rota", spaceId] })
      notify.success(isEdit ? t("scheduling.rota.toast.updated") : t("scheduling.rota.toast.created"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.rota.toast.saveFailed")),
  })

  const toggleWeekday = (d: number) =>
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  const toggleMonthDay = (d: number) =>
    setDaysOfMonth((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  const addDate = () => {
    if (dateInput && !dates.includes(dateInput)) setDates((prev) => [...prev, dateInput])
    setDateInput("")
  }
  const removeDate = (d: string) => setDates((prev) => prev.filter((x) => x !== d))

  const handleSave = () => {
    if (!userId) return notify.error(t("scheduling.rota.selectMemberError"))
    if (!shiftId) return notify.error(t("scheduling.rota.selectShiftError"))
    if (recurrence === ShiftRecurrence.WEEKLY && daysOfWeek.length === 0)
      return notify.error(t("scheduling.rota.selectWeekdayError"))
    if (recurrence === ShiftRecurrence.MONTHLY && daysOfMonth.length === 0)
      return notify.error(t("scheduling.rota.selectMonthDayError"))
    if (recurrence === ShiftRecurrence.ONE_OFF && dates.length === 0)
      return notify.error(t("scheduling.rota.selectDateError"))

    mutation.mutate({
      userId,
      shiftId,
      recurrence,
      daysOfWeek: recurrence === ShiftRecurrence.WEEKLY ? daysOfWeek : undefined,
      daysOfMonth: recurrence === ShiftRecurrence.MONTHLY ? daysOfMonth : undefined,
      dates: recurrence === ShiftRecurrence.ONE_OFF ? dates : undefined,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || null,
      priority: parseInt(priority, 10) || 0,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("scheduling.rota.editTitle") : t("scheduling.rota.new")}</DialogTitle>
          <DialogDescription>{t("scheduling.rota.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("scheduling.rota.fields.member")}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("scheduling.rota.selectMember")} />
              </SelectTrigger>
              <SelectContent>
                {employees.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">{t("scheduling.rota.noMembers")}</div>
                ) : (
                  employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("scheduling.rota.fields.shift")}</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger>
                <SelectValue placeholder={t("scheduling.rota.selectShift")} />
              </SelectTrigger>
              <SelectContent>
                {activeShifts.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">{t("scheduling.rota.noShifts")}</div>
                ) : (
                  activeShifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.startLocal}–{s.endLocal})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("scheduling.rota.fields.recurrence")}</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as ShiftRecurrence)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`scheduling.rota.recurrence.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recurrence === ShiftRecurrence.WEEKLY && (
            <div className="space-y-2">
              <Label className="text-xs">{t("scheduling.rota.fields.weekdays")}</Label>
              <div className="flex gap-1">
                {WEEKDAY_KEYS.map((key, idx) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleWeekday(idx)}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors border",
                      daysOfWeek.includes(idx)
                        ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {t(`scheduling.rota.weekdaysShort.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recurrence === ShiftRecurrence.MONTHLY && (
            <div className="space-y-2">
              <Label className="text-xs">{t("scheduling.rota.fields.monthDays")}</Label>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleMonthDay(d)}
                    className={cn(
                      "rounded-md py-1.5 text-xs font-medium transition-colors border",
                      daysOfMonth.includes(d)
                        ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {recurrence === ShiftRecurrence.ONE_OFF && (
            <div className="space-y-2">
              <Label className="text-xs">{t("scheduling.rota.fields.dates")}</Label>
              <div className="flex gap-2">
                <Input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
                <Button type="button" variant="outline" onClick={addDate} disabled={!dateInput}>
                  {t("common.add")}
                </Button>
              </div>
              {dates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dates.slice().sort().map((d) => (
                    <Badge key={d} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeDate(d)}>
                      {d}
                      <span className="text-muted-foreground">×</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rota-from">{t("scheduling.rota.fields.effectiveFrom")}</Label>
              <Input id="rota-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rota-to">{t("scheduling.rota.fields.effectiveTo")}</Label>
              <Input id="rota-to" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rota-priority">{t("scheduling.rota.fields.priority")}</Label>
            <Input id="rota-priority" type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} className="w-28" />
            <p className="text-[11px] text-muted-foreground">{t("scheduling.rota.priorityHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
