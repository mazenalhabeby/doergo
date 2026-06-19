"use client"

import { memo } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export interface EditableScheduleRow {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

/** Default Mon–Fri 09:00–17:00 week. */
export function createDefaultSchedule(): EditableScheduleRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: "09:00",
    endTime: "17:00",
    isActive: i >= 1 && i <= 5,
  }))
}

const CompactScheduleEditor = memo(function CompactScheduleEditor({
  rows,
  onChange,
}: {
  rows: EditableScheduleRow[]
  onChange: (rows: EditableScheduleRow[]) => void
}) {
  const updateRow = (dayOfWeek: number, field: keyof EditableScheduleRow, value: string | boolean) => {
    onChange(rows.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, [field]: value } : row)))
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">Weekly hours</Label>
      <div className="border rounded-lg divide-y divide-border/60 bg-muted/20">
        {rows.map((row) => (
          <div
            key={row.dayOfWeek}
            className={cn(
              "grid grid-cols-[44px_1fr_1fr_36px] items-center gap-2 px-3 py-1.5 transition-opacity",
              !row.isActive && "opacity-40",
            )}
          >
            <span className="text-xs font-medium text-foreground">{DAY_NAMES[row.dayOfWeek]}</span>
            <Input
              type="time"
              value={row.startTime}
              onChange={(e) => updateRow(row.dayOfWeek, "startTime", e.target.value)}
              className="h-7 text-xs px-2"
              disabled={!row.isActive}
            />
            <Input
              type="time"
              value={row.endTime}
              onChange={(e) => updateRow(row.dayOfWeek, "endTime", e.target.value)}
              className="h-7 text-xs px-2"
              disabled={!row.isActive}
            />
            <div className="flex justify-center">
              <Switch
                checked={row.isActive}
                onCheckedChange={(checked) => updateRow(row.dayOfWeek, "isActive", !!checked)}
                className="scale-75"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

/**
 * Shared schedule control — the type picker (No tracking / Fixed / Flexible)
 * plus the weekly-hours editor (Fixed) or a monthly-hour budget (Flexible).
 * Used by BOTH the Edit Member dialog and the Invite dialog so the two stay
 * identical (DRY).
 */
export function ScheduleFields({
  scheduleType,
  onScheduleTypeChange,
  scheduleRows,
  onScheduleRowsChange,
  monthlyHourBudget,
  onMonthlyHourBudgetChange,
}: {
  scheduleType: string
  onScheduleTypeChange: (v: string) => void
  scheduleRows: EditableScheduleRow[]
  onScheduleRowsChange: (rows: EditableScheduleRow[]) => void
  monthlyHourBudget: number | ""
  onMonthlyHourBudgetChange: (v: number | "") => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Schedule</Label>
        <Select
          value={scheduleType}
          onValueChange={(v) => {
            onScheduleTypeChange(v)
            // Seed a default week the first time Fixed is chosen.
            if (v === "FIXED") onScheduleRowsChange(createDefaultSchedule())
          }}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">No tracking</SelectItem>
            <SelectItem value="FIXED">Fixed schedule</SelectItem>
            <SelectItem value="FLEXIBLE">Flexible hours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scheduleType === "FIXED" && <CompactScheduleEditor rows={scheduleRows} onChange={onScheduleRowsChange} />}

      {scheduleType === "FLEXIBLE" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Monthly hour budget</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={744}
              value={monthlyHourBudget}
              onChange={(e) => onMonthlyHourBudgetChange(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="160"
              className="h-9 w-28 focus-visible:ring-offset-0"
            />
            <span className="text-sm text-muted-foreground">hours/month</span>
          </div>
        </div>
      )}
    </>
  )
}
