"use client"

import { Trash2, CalendarClock } from "lucide-react"
import { type ReportCadence } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import type { ReportsPageState } from "./use-reports-page"

/** Part of ReportsPage's markup, moved here unchanged; it reads the page's state from `s`. */
export function ReportsPageScheduleTitle({ s }: { s: ReportsPageState }) {
  const {
    schedOpen,
    setSchedOpen,
    t,
    schedules,
    delSched,
    schedForm,
    setSchedForm,
    createSched,
  } = s
  return (
    <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("reports.scheduleTitle", "Schedule email delivery")}</DialogTitle></DialogHeader>

        {/* Existing schedules */}
        {schedules && schedules.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border p-2">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-medium capitalize">{s.cadence}</span> @ {String(s.hour).padStart(2, "0")}:00 UTC → {s.recipients.join(", ")}
                </span>
                <button onClick={() => delSched.mutate(s.id)} className="text-muted-foreground hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {/* New schedule */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.cadence", "Frequency")}</Label>
              <Select value={schedForm.cadence} onValueChange={(v) => setSchedForm({ ...schedForm, cadence: v as ReportCadence })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                  <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                  <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.hour", "Hour (UTC)")}</Label>
              <Input type="number" min={0} max={23} value={schedForm.hour} onChange={(e) => setSchedForm({ ...schedForm, hour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
            </div>
          </div>
          {schedForm.cadence === "weekly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.dayOfWeek", "Day of week")}</Label>
              <Select value={String(schedForm.dayOfWeek)} onValueChange={(v) => setSchedForm({ ...schedForm, dayOfWeek: Number(v) })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {schedForm.cadence === "monthly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.dayOfMonth", "Day of month (1–28)")}</Label>
              <Input type="number" min={1} max={28} value={schedForm.dayOfMonth} onChange={(e) => setSchedForm({ ...schedForm, dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("reports.recipients", "Recipients (comma-separated emails)")}</Label>
            <Input value={schedForm.recipients} onChange={(e) => setSchedForm({ ...schedForm, recipients: e.target.value })} placeholder="anna@example.com, john@example.com" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setSchedOpen(false)}>{t("common.close", "Close")}</Button>
          <Button disabled={!schedForm.recipients.trim() || createSched.isPending} onClick={() => createSched.mutate()}>{createSched.isPending ? t("common.saving", "Saving…") : t("reports.addSchedule", "Add schedule")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
