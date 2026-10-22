import { type ReportDatePreset, type ReportGranularity } from "@/lib/api"
import { formatReportCell } from "@/lib/report-pdf-options"
import { dateLocale } from "@/lib/format-date"

/** The choices the report builder offers, and the one cell formatter its outputs share. */
export const DATE_PRESETS: { value: ReportDatePreset; label: string }[] = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
]

// The table, its chart and the PDF read one cell formatter, in the reader's language.
export function fmt(value: unknown, format?: string): string {
  return formatReportCell(value, format, dateLocale())
}

export const GRANULARITIES: { value: ReportGranularity; label: string }[] = [
  { value: "none", label: "No time split" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
]

// Selectable columns for the detailed timesheet. Every column is freely
// toggleable; the picker only enforces that at least one stays selected.
// Named from the same catalogue as the table headings (`col.<key>`), so the
// chip and the column it adds cannot be called two different things.
export const TIMESHEET_COLS: string[] = [
  "date",
  "day",
  "shiftStart",
  "shiftEnd",
  "clockIn",
  "clockOut",
  "break",
  "hours",
  "hoursInShift",
  "late",
  "overtime",
  "jobs",
  "leaveReason",
  "location",
  "remote",
  "note",
  "status",
]

/*
  The column key stays `hours` (saved choices keep working); what it holds is
  clock time minus breaks, so its chip reads "Hours worked" beside "Hours in
  shift" — two numbers called "Hours" would be read as the same thing.
*/
export const TIMESHEET_LABEL: Record<string, string> = { hours: "col.hoursWorked" }
