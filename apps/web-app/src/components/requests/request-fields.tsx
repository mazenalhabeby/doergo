"use client"

import { useTranslation } from "react-i18next"
import { REQUEST_LIMITS } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { formatRequestMinutes, type RequestKind } from "@/lib/requests"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** The quick picks for overtime agreed in advance. */
const OVERTIME_PRESETS = [30, 60, 120, 180] as const
const OVERTIME_STEP = 15

export interface RequestFieldsValue {
  spaceId: string
  startTime: string
  endTime: string
  minutes: number
  reason: string
}

/**
 * What a non-leave request needs beyond its dates — one block per kind.
 *
 *   REMOTE    the workspace the remote day counts for (+ a short reason)
 *   HOURS     the day's new start and/or finish (+ why)
 *   OVERTIME  how long, agreed in advance (+ why)
 *   OTHER     the words — they ARE the request, so they are required
 *
 * Limits come from the shared contract (`REQUEST_LIMITS`); whether the whole
 * thing is valid is asked of the shared parser by the page, never decided here.
 */
export function RequestFields({
  kind,
  value,
  onChange,
  remoteSpaces,
}: {
  kind: Exclude<RequestKind, "LEAVE">
  value: RequestFieldsValue
  onChange: (patch: Partial<RequestFieldsValue>) => void
  remoteSpaces: { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  const clampMinutes = (m: number) =>
    Math.min(REQUEST_LIMITS.OVERTIME_MAX_MINUTES, Math.max(REQUEST_LIMITS.OVERTIME_MIN_MINUTES, m))

  return (
    <div className="space-y-3">
      {kind === "REMOTE" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("requests.form.workspace")}</Label>
          {remoteSpaces.length === 1 ? (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">{remoteSpaces[0]!.name}</p>
          ) : (
            <Select value={value.spaceId || undefined} onValueChange={(v) => onChange({ spaceId: v })}>
              <SelectTrigger className="h-9 rounded-xl text-sm">
                <SelectValue placeholder={t("requests.form.workspacePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {remoteSpaces.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {kind === "HOURS" && (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="req-start" className="text-xs text-muted-foreground">{t("requests.form.startAt")}</Label>
              <Input
                id="req-start"
                type="time"
                value={value.startTime}
                onChange={(e) => onChange({ startTime: e.target.value })}
                className="h-9 rounded-xl tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-end" className="text-xs text-muted-foreground">{t("requests.form.finishAt")}</Label>
              <Input
                id="req-end"
                type="time"
                value={value.endTime}
                onChange={(e) => onChange({ endTime: e.target.value })}
                className="h-9 rounded-xl tabular-nums"
              />
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">{t("requests.form.hoursHint")}</p>
        </div>
      )}

      {kind === "OVERTIME" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("requests.form.howLong")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center overflow-hidden rounded-xl border border-border bg-background">
              <button
                type="button"
                className="px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
                onClick={() => onChange({ minutes: clampMinutes(value.minutes - OVERTIME_STEP) })}
                disabled={value.minutes <= REQUEST_LIMITS.OVERTIME_MIN_MINUTES}
                aria-label={t("requests.form.less")}
              >
                −
              </button>
              <span className="min-w-[5.5rem] border-x border-border px-3 py-1.5 text-center text-sm font-semibold tabular-nums">
                {formatRequestMinutes(value.minutes, t)}
              </span>
              <button
                type="button"
                className="px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
                onClick={() => onChange({ minutes: clampMinutes(value.minutes + OVERTIME_STEP) })}
                disabled={value.minutes >= REQUEST_LIMITS.OVERTIME_MAX_MINUTES}
                aria-label={t("requests.form.more")}
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {OVERTIME_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ minutes: m })}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    m === value.minutes ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-foreground/25",
                  )}
                >
                  {formatRequestMinutes(m, t)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="req-reason" className="text-xs text-muted-foreground">
          {kind === "OTHER" ? t("requests.form.whatRequired") : t("requests.form.reasonOptional")}
        </Label>
        <Textarea
          id="req-reason"
          value={value.reason}
          onChange={(e) => onChange({ reason: e.target.value })}
          maxLength={REQUEST_LIMITS.REASON_MAX}
          rows={2}
          placeholder={t(`requests.form.reasonPlaceholder.${kind}`)}
          className="min-h-[3.75rem] resize-none rounded-xl text-sm"
        />
      </div>
    </div>
  )
}
