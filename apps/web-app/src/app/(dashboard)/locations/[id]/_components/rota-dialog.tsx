"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { rotaApi, shiftsApi, employeesApi, type CreateRotaInput } from "@/lib/api"
import { personName, type ShiftAssignment, ShiftRecurrence } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WEEKDAY_KEYS } from "./rota-rules"

const RECURRENCES: ShiftRecurrence[] = [
  ShiftRecurrence.DAILY,
  ShiftRecurrence.WEEKLY,
  ShiftRecurrence.MONTHLY,
  ShiftRecurrence.ONE_OFF,
]

// ── Rota create/edit dialog ─────────────────────────────────────────────────

export function RotaDialog({
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
    queryKey: keys.schedules.rotaPeople(),
    queryFn: () => employeesApi.list({ limit: 100, status: "active" }),
  })
  const { data: shifts } = useQuery({
    queryKey: keys.schedules.shifts(spaceId),
    queryFn: () => shiftsApi.list(spaceId),
  })

  const employees = employeeData?.data || []
  const activeShifts = (shifts || []).filter((s) => s.isActive)

  const mutation = useMutation({
    mutationFn: (data: CreateRotaInput) =>
      isEdit ? rotaApi.update(assignment!.id, data) : rotaApi.create(spaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.schedules.rota(spaceId) })
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
                      {personName(e)}
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
                        ? "bg-shell-accent-soft text-shell-accent border-primary/30"
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
                        ? "bg-shell-accent-soft text-shell-accent border-primary/30"
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
                <DatePicker value={dateInput} onChange={setDateInput} className="flex-1" />
                <Button type="button" variant="outline" onClick={addDate} disabled={!dateInput}>
                  {t("common.add")}
                </Button>
              </div>
              {dates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dates
                    .slice()
                    .sort()
                    .map((d) => (
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
              <DatePicker id="rota-from" value={effectiveFrom} onChange={setEffectiveFrom} clearable />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rota-to">{t("scheduling.rota.fields.effectiveTo")}</Label>
              <DatePicker id="rota-to" value={effectiveTo} onChange={setEffectiveTo} clearable />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rota-priority">{t("scheduling.rota.fields.priority")}</Label>
            <Input
              id="rota-priority"
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-28"
            />
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
