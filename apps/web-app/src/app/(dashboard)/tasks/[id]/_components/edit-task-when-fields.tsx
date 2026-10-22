"use client"

import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { withTime } from "@/lib/due-time"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

interface EditTaskWhenFieldsProps {
  dueDate: Date | undefined
  setDueDate: React.Dispatch<React.SetStateAction<Date | undefined>>
  dueTime: string
  setDueTime: (time: string) => void
  estimatedHours: string
  setEstimatedHours: (hours: string) => void
  /** The save is running — every field waits. */
  saving: boolean
}

/** When the job is, on one line: the day, the hour to be on site, and how long it should take. */
export function EditTaskWhenFields({
  dueDate,
  setDueDate,
  dueTime,
  setDueTime,
  estimatedHours,
  setEstimatedHours,
  saving,
}: EditTaskWhenFieldsProps) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">{t("tasks.sidebar.dueDate")}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-10 w-full justify-start text-left font-normal rounded-lg border-border bg-card hover:bg-accent",
                !dueDate && "text-muted-foreground",
              )}
              disabled={saving}
            >
              <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
              {dueDate ? format(dueDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dueDate}
              onSelect={(d) => setDueDate(withTime(d, dueTime))}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-due-time" className="text-sm font-medium text-foreground">
          {t("tasks.create.beThereAt", "Be there at")}
        </Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="edit-due-time"
            type="time"
            value={dueTime}
            onChange={(e) => {
              setDueTime(e.target.value)
              setDueDate((d) => withTime(d, e.target.value))
            }}
            disabled={!dueDate || saving}
            className="h-10 rounded-lg"
          />
          {dueTime && (
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-2 text-xs"
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

      <div className="space-y-2">
        <Label htmlFor="edit-estimated-hours" className="text-sm font-medium text-foreground">
          {t("tasks.sidebar.estimatedHours")}
        </Label>
        <Input
          id="edit-estimated-hours"
          type="number"
          min="0"
          step="0.5"
          placeholder={t("tasks.fields.estimatedHoursPlaceholder")}
          value={estimatedHours}
          onChange={(e) => setEstimatedHours(e.target.value)}
          disabled={saving}
          className="h-10 rounded-lg"
        />
      </div>
    </div>
  )
}
