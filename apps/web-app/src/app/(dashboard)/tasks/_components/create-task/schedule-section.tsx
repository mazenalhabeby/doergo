"use client"

import { useTranslation } from "react-i18next"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { withTime } from "@/lib/due-time"
import { CollapsibleSection } from "./collapsible-section"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { type CreateTaskForm } from "./use-create-task-form"

/** Start date, due date, "be there at" and the estimate. */
export function ScheduleSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    hasModule,
    startDate,
    setStartDate,
    dueDate,
    setDueDate,
    dueTime,
    setDueTime,
    estimatedHours,
    setEstimatedHours,
    scheduleIndicator,
    isSubmitting,
  } = form

  return (
    <CollapsibleSection icon={Clock} label={t("tasks.view.schedule")} indicator={scheduleIndicator}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.sidebar.startDate")}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start text-left text-sm font-normal rounded-lg border-border bg-card hover:bg-accent",
                  !startDate && "text-muted-foreground",
                )}
                disabled={isSubmitting}
              >
                <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
                {startDate ? format(startDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("tasks.create.preferredDateLabel")}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start text-left text-sm font-normal rounded-lg border-border bg-card hover:bg-accent",
                  !dueDate && "text-muted-foreground",
                )}
                disabled={isSubmitting}
              >
                <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
                {dueDate
                  ? dueTime
                    ? `${format(dueDate, "MMM d, yyyy")} · ${dueTime}`
                    : format(dueDate, "MMM d, yyyy")
                  : t("tasks.create.selectDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={(d) => setDueDate(withTime(d, dueTime))}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/*
          ⚠️ A FIELD, not a thing hidden inside the date popover.

          It lived in the popover first and was invisible: nobody
          re-opens a date they have already set, so the feature might as
          well not have shipped. What somebody can set, they must see.
        */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("tasks.create.beThereAt", "Be there at")}
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="time"
              value={dueTime}
              onChange={(e) => {
                setDueTime(e.target.value)
                setDueDate((d) => withTime(d, e.target.value))
              }}
              disabled={!dueDate || isSubmitting}
              className="h-9 rounded-lg text-sm"
            />
            {dueTime && (
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-2 text-xs"
                onClick={() => {
                  setDueTime("")
                  setDueDate((d) => withTime(d, ""))
                }}
              >
                {t("common.clear", "Clear")}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {dueDate
              ? t("tasks.create.beThereHint", "The member is told when to set off, allowing for the drive.")
              : t("tasks.create.beThereNeedsDate", "Pick a due date first.")}
          </p>
        </div>
      </div>

      {hasModule('time_tracking') && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.sidebar.estimatedHours")}</Label>
          <Input
            type="number"
            min="0"
            step="0.5"
            placeholder={t("tasks.fields.estimatedHoursPlaceholder")}
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-lg border-border bg-card text-sm placeholder:text-muted-foreground"
          />
        </div>
      )}
    </CollapsibleSection>
  )
}
