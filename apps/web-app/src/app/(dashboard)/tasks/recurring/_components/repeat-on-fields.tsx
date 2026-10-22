"use client"

import { useTranslation } from "react-i18next"
import { type RecurringFrequency } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DAY_KEYS } from "./template-card"

type RepeatOnFieldsProps = {
  frequency: RecurringFrequency
  customDays: number
  setCustomDays: (n: number) => void
  dayOfWeek: number
  setDayOfWeek: (n: number) => void
  dayOfMonth: number
  setDayOfMonth: (n: number) => void
}

/** The frequency's own question: every N days, which weekday, or which day of the month. */
export function RepeatOnFields({
  frequency,
  customDays,
  setCustomDays,
  dayOfWeek,
  setDayOfWeek,
  dayOfMonth,
  setDayOfMonth,
}: RepeatOnFieldsProps) {
  const { t } = useTranslation()
  return (
    <>
      {frequency === "CUSTOM" && (
        <div className="space-y-2">
          <Label>{t("tasks.recurring.everyNDays")}</Label>
          <Input
            type="number"
            min={1}
            value={customDays}
            onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
          />
        </div>
      )}

      {["WEEKLY", "BIWEEKLY"].includes(frequency) && (
        <div className="space-y-2">
          <Label>{t("tasks.recurring.dayOfWeek")}</Label>
          <Select value={dayOfWeek.toString()} onValueChange={(v) => setDayOfWeek(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_KEYS.map((name, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {t(`tasks.weekdaysFull.${name}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {["MONTHLY", "QUARTERLY", "YEARLY"].includes(frequency) && (
        <div className="space-y-2">
          <Label>{t("tasks.recurring.dayOfMonth")}</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
          />
        </div>
      )}
    </>
  )
}
