"use client"

import { useQuery } from "@tanstack/react-query"
import { Clock, MapPin, CircleDot } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"

/** Human-readable duration between two ISO timestamps (or to now). */
function duration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—"
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  const mins = Math.max(0, Math.round((to - from) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export default function MyAttendancePage() {
  const { user } = useAuth()
  const canSee = !user || hasAccessModule(user, "clock")

  const { data: status } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceApi.getMyStatus(),
    enabled: canSee,
    staleTime: 15_000,
  })

  const { data: history, isLoading } = useQuery({
    queryKey: ["my-attendance-history"],
    queryFn: () => attendanceApi.getMyHistory({ limit: 60 }),
    enabled: canSee,
  })

  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        You don&apos;t have access to Attendance.
      </div>
    )
  }

  const entries: TimeEntry[] = (history as { data?: TimeEntry[] })?.data ?? []
  const st = (status ?? {}) as Record<string, unknown>
  const activeEntry = (st.activeEntry ?? st.entry) as TimeEntry | undefined
  const clockedIn = Boolean(st.isClockedIn) || st.status === "CLOCKED_IN" || (activeEntry && !activeEntry.clockOutAt)

  // Total hours this list (rough sum of completed entries)
  const totalMins = entries.reduce((acc, e) => {
    if (!e.clockInAt) return acc
    const to = e.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now()
    return acc + Math.max(0, (to - new Date(e.clockInAt).getTime()) / 60000)
  }, 0)
  const totalH = Math.floor(totalMins / 60)
  const totalM = Math.round(totalMins % 60)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground">Your clock-in history and hours. Clock in/out happens on the mobile app.</p>
      </div>

      {/* Status + summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CircleDot className={`h-4 w-4 ${clockedIn ? "text-green-600" : "text-slate-400"}`} />
            Current status
          </div>
          <p className="mt-2 text-lg font-semibold text-foreground">{clockedIn ? "Clocked in" : "Clocked out"}</p>
          {clockedIn && activeEntry?.clockInAt && (
            <p className="text-xs text-muted-foreground">Since {fmtTime(activeEntry.clockInAt)} · {duration(activeEntry.clockInAt)}</p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-4 w-4 text-slate-400" />
            Hours (last {entries.length})
          </div>
          <p className="mt-2 text-lg font-semibold text-foreground">{totalH}h {totalM}m</p>
        </div>
      </div>

      {/* History */}
      <h2 className="text-sm font-semibold text-foreground mb-3">Recent entries</h2>
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">No attendance records yet.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {entries.map((e, i) => (
            <div key={e.id} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="w-28 shrink-0 text-sm font-medium text-foreground">{fmtDate(e.clockInAt)}</div>
              <div className="flex-1 text-sm text-muted-foreground">
                {fmtTime(e.clockInAt)} → {e.clockOutAt ? fmtTime(e.clockOutAt) : <span className="text-green-600">active</span>}
                {e.location?.name && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{e.location.name}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-sm font-semibold text-foreground">{duration(e.clockInAt, e.clockOutAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
