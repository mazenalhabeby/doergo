"use client"

import { type ScheduleEntry } from "@/lib/api"

export const DAY_NAME_KEYS = [
  "technicians.scheduleTab.days.sunday",
  "technicians.scheduleTab.days.monday",
  "technicians.scheduleTab.days.tuesday",
  "technicians.scheduleTab.days.wednesday",
  "technicians.scheduleTab.days.thursday",
  "technicians.scheduleTab.days.friday",
  "technicians.scheduleTab.days.saturday",
]

export interface EditableScheduleRow {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
  notes: string
}

export function createDefaultSchedule(): EditableScheduleRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: "09:00",
    endTime: "17:00",
    isActive: i >= 1 && i <= 5, // Mon-Fri active by default
    notes: "",
  }))
}

export function scheduleToEditable(schedule: ScheduleEntry[]): EditableScheduleRow[] {
  const rows = createDefaultSchedule()
  for (const entry of schedule) {
    const row = rows[entry.dayOfWeek]
    if (row) {
      row.startTime = entry.startTime
      row.endTime = entry.endTime
      row.isActive = entry.isActive
      row.notes = entry.notes || ""
    }
  }
  return rows
}

export interface ScheduleTabProps {
  employeeId: string
  canManage: boolean
}
