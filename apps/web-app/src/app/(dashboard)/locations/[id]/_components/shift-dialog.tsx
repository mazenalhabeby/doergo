"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Moon } from "lucide-react"
import { notify } from "@/lib/toast"
import { shiftsApi, type CreateShiftInput } from "@/lib/api"
import { shiftCrossesMidnight, type Shift } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { keys } from "@/lib/query-keys"

export const DEFAULT_COLOR = "#2563eb"

// ── Shift create/edit dialog ────────────────────────────────────────────────

export function ShiftDialog({
  spaceId,
  shift,
  open,
  onOpenChange,
}: {
  spaceId: string
  shift: Shift | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!shift

  const [name, setName] = useState(shift?.name || "")
  const [description, setDescription] = useState(shift?.description || "")
  const [color, setColor] = useState(shift?.color || DEFAULT_COLOR)
  const [startLocal, setStartLocal] = useState(shift?.startLocal || "09:00")
  const [endLocal, setEndLocal] = useState(shift?.endLocal || "17:00")
  const [breakMinutes, setBreakMinutes] = useState(String(shift?.breakMinutes ?? 0))
  const [graceMin, setGraceMin] = useState(String(shift?.graceMin ?? 15))
  const [reminderIntervalMin, setReminderIntervalMin] = useState(String(shift?.reminderIntervalMin ?? 15))
  const [maxReminders, setMaxReminders] = useState(String(shift?.maxReminders ?? 3))
  const [flagToleranceMin, setFlagToleranceMin] = useState(String(shift?.flagToleranceMin ?? 10))

  const crosses = shiftCrossesMidnight(startLocal, endLocal)

  const mutation = useMutation({
    mutationFn: (data: CreateShiftInput) =>
      isEdit ? shiftsApi.update(shift!.id, data) : shiftsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.schedules.shifts(spaceId) })
      notify.success(isEdit ? t("scheduling.shifts.toast.updated") : t("scheduling.shifts.toast.created"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.shifts.toast.saveFailed")),
  })

  const toInt = (v: string, fallback = 0) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("scheduling.shifts.nameRequired"))
    mutation.mutate({
      spaceId,
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      startLocal,
      endLocal,
      breakMinutes: toInt(breakMinutes),
      graceMin: toInt(graceMin),
      reminderIntervalMin: toInt(reminderIntervalMin, 15),
      maxReminders: toInt(maxReminders, 3),
      flagToleranceMin: toInt(flagToleranceMin, 10),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("scheduling.shifts.editTitle") : t("scheduling.shifts.new")}</DialogTitle>
          <DialogDescription>{t("scheduling.shifts.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="shift-name">{t("scheduling.shifts.fields.name")}</Label>
            <Input
              id="shift-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("scheduling.shifts.namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift-desc">{t("scheduling.shifts.fields.description")}</Label>
            <Textarea id="shift-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift-color">{t("scheduling.shifts.fields.color")}</Label>
            <div className="flex items-center gap-2">
              <input
                id="shift-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent"
              />
              <span className="text-xs text-muted-foreground">{color}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shift-start">{t("scheduling.shifts.fields.start")}</Label>
              <Input id="shift-start" type="time" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-end">{t("scheduling.shifts.fields.end")}</Label>
              <Input id="shift-end" type="time" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
            </div>
          </div>

          {crosses && (
            <Badge
              variant="outline"
              className={"gap-1 border-indigo-200 bg-indigo-50 text-indigo-700 " +
                "dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"}
            >
              <Moon className="h-3 w-3" />
              {t("scheduling.shifts.crossesMidnight")}
            </Badge>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shift-break">{t("scheduling.shifts.fields.breakMinutes")}</Label>
              <Input id="shift-break" type="number" min={0} value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-grace">{t("scheduling.shifts.fields.graceMin")}</Label>
              <Input id="shift-grace" type="number" min={0} value={graceMin} onChange={(e) => setGraceMin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-interval">{t("scheduling.shifts.fields.reminderIntervalMin")}</Label>
              <Input
                id="shift-interval"
                type="number"
                min={0}
                value={reminderIntervalMin}
                onChange={(e) => setReminderIntervalMin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-max">{t("scheduling.shifts.fields.maxReminders")}</Label>
              <Input id="shift-max" type="number" min={0} value={maxReminders} onChange={(e) => setMaxReminders(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-tolerance">{t("scheduling.shifts.fields.flagToleranceMin", "Late/overtime tolerance (min)")}</Label>
              <Input
                id="shift-tolerance"
                type="number"
                min={0}
                value={flagToleranceMin}
                onChange={(e) => setFlagToleranceMin(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("scheduling.shifts.reminderHint")}</p>
          <p
            className="text-[11px] text-muted-foreground">{t(
              "scheduling.shifts.toleranceHint",
              ("Grace before an entry is flagged Late Arrival, Early Departure or " + "Overtime."))}</p>
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
