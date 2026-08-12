"use client"

import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { Pencil, Loader2, ArrowRight, History } from "lucide-react"

import { attendanceApi, type TimeEntry, type EntryEditChange, type EntryEditHistoryItem } from "@/lib/api"
import { useTimeFormat } from "@/hooks"
import { formatTimeOfDay } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Local time formatter (kept self-contained to avoid a circular import with
// attendance-helpers, which imports this dialog).
const formatTime = (v: string | null, hour12: boolean, locale?: string, tz?: string | null) =>
  v ? formatTimeOfDay(v, hour12, locale, tz) : "—"

const TIME_FIELDS = new Set(["clockInAt", "clockOutAt"])

/**
 * Full edit-history table for a time entry. Reads the per-edit audit rows
 * (activity_logs) written on each edit; falls back to the single stored snapshot
 * (original → current) for entries edited before per-edit logging shipped, so it
 * is never empty for an edited row.
 */
export function EditHistoryDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: TimeEntry
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  const tz = entry.timezone ?? entry.location?.timezone

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["entryHistory", entry.id],
    queryFn: () => attendanceApi.getEntryHistory(entry.id),
    enabled: open,
  })

  const fieldLabel = (f: string) =>
    ({
      clockInAt: t("attendance.clockIn"),
      clockOutAt: t("attendance.clockOut"),
      notes: t("attendance.notes"),
      timezone: t("attendance.history.timezone", "Timezone"),
    })[f] ?? f

  const fmtVal = (field: string, v: string | null) => {
    if (v == null || v === "") return "—"
    return TIME_FIELDS.has(field) ? formatTime(v, hour12, locale, tz) : v
  }

  // Fallback single row from the stored snapshot when there are no audit rows yet.
  const fallback: EntryEditHistoryItem[] =
    !isLoading && history.length === 0 && entry.isEdited
      ? [
          {
            id: "snapshot",
            editedAt: entry.editedAt ?? entry.updatedAt,
            editor: entry.editedBy ? `${entry.editedBy.firstName} ${entry.editedBy.lastName}`.trim() : null,
            reason: entry.editReason ?? null,
            changes: [
              ...(entry.originalClockIn && entry.originalClockIn !== entry.clockInAt
                ? [{ field: "clockInAt", from: entry.originalClockIn, to: entry.clockInAt } as EntryEditChange]
                : []),
              ...(entry.originalClockOut && entry.originalClockOut !== entry.clockOutAt
                ? [{ field: "clockOutAt", from: entry.originalClockOut, to: entry.clockOutAt } as EntryEditChange]
                : []),
            ],
          },
        ]
      : []

  const rows = history.length > 0 ? history : fallback

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-amber-600" />
            {t("attendance.history.title", "Edit history")}
          </DialogTitle>
          <DialogDescription>
            {t("attendance.history.subtitle", "Every manual change to this attendance record.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("attendance.history.none", "No edits recorded.")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="font-semibold text-muted-foreground">{t("attendance.history.when", "When")}</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">{t("attendance.history.editor", "Editor")}</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">{t("attendance.history.change", "Change")}</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">{t("attendance.edited.reason", "Reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(row.editedAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <span className="inline-flex items-center gap-1">
                        <Pencil className="size-3 text-muted-foreground" />
                        {row.editor ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.changes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-1">
                          {row.changes.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="w-16 shrink-0 text-muted-foreground">{fieldLabel(c.field)}</span>
                              <span className="text-muted-foreground line-through tabular-nums">{fmtVal(c.field, c.from)}</span>
                              <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
                              <span className="font-medium text-foreground tabular-nums">{fmtVal(c.field, c.to)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
