"use client"

import { useTranslation } from "react-i18next"
import { Repeat } from "lucide-react"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type RecurringFrequency } from "@/lib/api"
import { type CreateTaskForm } from "./use-create-task-form"

/** Repeat (recurring) — turns the task into a recurring template. Professional+. */
export function RepeatSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    canRecur,
    isRecurring,
    setIsRecurring,
    frequency,
    setFrequency,
    customDays,
    setCustomDays,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    recurStart,
    setRecurStart,
    recurEnd,
    setRecurEnd,
    isSubmitting,
  } = form
  if (!canRecur) return null

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{t("tasks.recurring.repeatTask")}</span>
        </div>
        <Switch checked={isRecurring} onCheckedChange={setIsRecurring} disabled={isSubmitting} />
      </div>

      {isRecurring && (
        <div className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t("tasks.recurring.frequency")}</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"].map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`tasks.recurring.frequencies.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {frequency === "CUSTOM" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t("tasks.recurring.everyNDays")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={customDays}
                  onChange={(e) => setCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-9 rounded-lg text-sm"
                  disabled={isSubmitting}
                />
              </div>
            )}
            {["WEEKLY", "BIWEEKLY"].includes(frequency) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t("tasks.recurring.dayOfWeek")}</Label>
                <Select
                  value={String(dayOfWeek)}
                  onValueChange={(v) => setDayOfWeek(parseInt(v))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-9 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((d, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {t(`tasks.weekdaysFull.${d}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t("tasks.recurring.dayOfMonth")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="h-9 rounded-lg text-sm"
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="repeat-start" className="text-xs font-medium text-muted-foreground">
                {t("tasks.sidebar.startDate")}
              </Label>
              <DatePicker id="repeat-start" value={recurStart} onChange={setRecurStart} disabled={isSubmitting} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repeat-end" className="text-xs font-medium text-muted-foreground">
                {t("tasks.recurring.endDateOptional")}
              </Label>
              <DatePicker id="repeat-end" clearable value={recurEnd} onChange={setRecurEnd} disabled={isSubmitting} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("tasks.recurring.generatesHint")}</p>
        </div>
      )}
    </div>
  )
}
