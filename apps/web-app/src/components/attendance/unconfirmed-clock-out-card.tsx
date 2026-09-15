"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Loader2 } from "lucide-react"
import type { UnconfirmedClockOut } from "@hbcfield/shared"

import { attendanceApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useTimeFormat } from "@/hooks"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** A moment as `<input type="datetime-local">` holds it, in the viewer's own zone. */
function toLocalInput(value: string | Date): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * "Your shift on Monday was closed at 17:00 — when did you actually leave?"
 *
 * The open-shift sweep closes a shift somebody forgot with a TEMPORARY time,
 * and the email about it links here (`?confirm=<entry>`). The phone has always
 * been able to answer; the web had nowhere to, so the link in the email would
 * have landed on a page that showed the shift flagged and offered no way to
 * fix it.
 *
 * Reads the status the clock already loads (same query key — no second
 * request), and answers through the same endpoint the phone uses.
 *
 * The input is in the viewer's own zone, as every date-time input in the
 * product is; the times shown beside it are in the shift's.
 */
export function UnconfirmedClockOutCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { formatTime, locale } = useTimeFormat()
  const qc = useQueryClient()
  const ref = useRef<HTMLDivElement>(null)

  const { data: status } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceApi.getMyStatus(),
    staleTime: 15_000,
  })
  const entry = (status as { unconfirmedClockOut?: UnconfirmedClockOut | null } | undefined)?.unconfirmedClockOut ?? null

  const [leftAt, setLeftAt] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (entry) setLeftAt(toLocalInput(entry.clockOutAt))
  }, [entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from the email (`?confirm=<entry>`): bring the question into view.
  // Read once from the address rather than useSearchParams, which would make
  // the whole page wait for a Suspense boundary it does not otherwise need.
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(null)
  useEffect(() => {
    setHighlightEntryId(new URLSearchParams(window.location.search).get("confirm"))
  }, [])
  const highlighted = !!entry && highlightEntryId === entry.id
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlighted])

  if (!entry) return null

  const tz = entry.timezone ?? entry.location?.timezone ?? undefined
  const day = (() => {
    const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }
    try {
      return new Date(entry.clockInAt).toLocaleDateString(locale, { ...opts, timeZone: tz })
    } catch {
      return new Date(entry.clockInAt).toLocaleDateString(locale, opts)
    }
  })()
  const temporary = formatTime(String(entry.clockOutAt), tz)

  const submit = async (iso: string) => {
    const at = new Date(iso)
    if (Number.isNaN(at.getTime()) || at <= new Date(entry.clockInAt) || at.getTime() > Date.now() + 60_000) {
      notify.error(t("attendance.my.unconfirmed.invalid"))
      return
    }
    setSaving(true)
    try {
      await attendanceApi.resolveForgotClockOut(entry.id, at.toISOString())
      notify.success(t("attendance.my.unconfirmed.saved"))
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] })
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] })
    } catch (e) {
      notify.error(errorMessage(e, t("attendance.my.unconfirmed.failed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5",
        highlighted && "ring-2 ring-amber-500/40",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {t("attendance.my.unconfirmed.title", { day, time: temporary })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("attendance.my.unconfirmed.body")}</p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unconfirmed-left-at" className="text-xs text-muted-foreground">
                {t("attendance.my.unconfirmed.leftAt")}
              </Label>
              <Input
                id="unconfirmed-left-at"
                type="datetime-local"
                value={leftAt}
                min={toLocalInput(entry.clockInAt)}
                max={toLocalInput(new Date())}
                onChange={(e) => setLeftAt(e.target.value)}
                className="h-9 w-auto"
              />
            </div>
            <Button size="sm" onClick={() => submit(leftAt)} disabled={saving || !leftAt}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("attendance.my.unconfirmed.save")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => submit(String(entry.clockOutAt))} disabled={saving}>
              {t("attendance.my.unconfirmed.keep", { time: temporary })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
