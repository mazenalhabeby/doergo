"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, CalendarClock, CalendarDays, Pencil, Trash2, Loader2, User } from "lucide-react"

import { notify } from "@/lib/toast"
import {
  rotaApi,
  shiftsApi,
  employeesApi,
  type CreateRotaInput,
} from "@/lib/api"
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

export function RotaTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ShiftAssignment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShiftAssignment | null>(null)

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["rota", spaceId],
    queryFn: () => rotaApi.list(spaceId),
  })

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
        <div className="space-y-2">
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
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
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
