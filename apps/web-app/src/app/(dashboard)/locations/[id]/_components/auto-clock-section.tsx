"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, MapPinOff, Radar } from "lucide-react"
import { AUTO_CLOCK_LIMITS, type AutoClockSettings } from "@hbcfield/shared/client"

import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import {
  AUTO_CLOCK_FIELDS,
  autoClockAvailability,
  autoClockDirty,
  autoClockFieldError,
  autoClockFieldHintKey,
  autoClockFieldLabelKey,
  autoClockForm,
  autoClockSubmission,
  savedAutoClock,
  type AutoClockField,
  type AutoClockForm,
} from "@/lib/auto-clock"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SectionHeader } from "../../../../../components/common/section-header"

/**
 * "Automatic clock" — the workspace half of the opt-in (the member's consent in
 * the app is the other half; the Members page picks who it applies to).
 *
 * Same shape as the request-kinds section beside it: the on/off switch saves at
 * once; the numbers save together with a Save button, judged first by the
 * SHARED strict parser (`lib/auto-clock`), so the form refuses exactly what the
 * server would. Read from the workspace detail the tab already has — no request
 * of its own.
 *
 * Not offered for the Remote bucket (there is no area to enter). A workspace
 * with no map point is told why rather than having the section vanish.
 */
export function AutoClockSection({
  space,
}: {
  space: { id: string; isRemote?: boolean | null; lat?: number | null; lng?: number | null; autoClock?: unknown }
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const availability = autoClockAvailability(space)

  // The saved settings, keyed by their JSON so a refetch with the same values does not reset the form.
  const savedKey = JSON.stringify(savedAutoClock(space.autoClock))
  const saved = useMemo<AutoClockSettings>(() => JSON.parse(savedKey), [savedKey])
  const [enabled, setEnabled] = useState(saved.enabled)
  const [form, setForm] = useState<AutoClockForm>(() => autoClockForm(saved))
  const [refused, setRefused] = useState<AutoClockField | null>(null)

  // Follow the server when it changes underneath us (another admin, a refetch).
  useEffect(() => {
    setEnabled(saved.enabled)
    setForm(autoClockForm(saved))
    setRefused(null)
  }, [saved])

  const save = useMutation({
    mutationFn: (autoClock: AutoClockSettings) => locationsApi.update(space.id, { autoClock }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      qc.invalidateQueries({ queryKey: keys.locations.lists() })
      // The Members page shows the per-person switch only while this is on.
      qc.invalidateQueries({ queryKey: keys.locations.roster(space.id) })
      notify.success(t("attendance.noShift.saved", "Saved"))
    },
    onError: (e: Error & { params?: { field?: string } }) => {
      notify.error(serverErrorMessage(e, t))
      const field = e.params?.field
      if (field && (AUTO_CLOCK_FIELDS as readonly string[]).includes(field)) setRefused(field as AutoClockField)
      setEnabled(saved.enabled)
    },
  })

  if (availability === "remote") return null

  const header = (
    <SectionHeader icon={Radar} title={t("attendance.autoClock.title")} description={t("attendance.autoClock.subtitle")} />
  )

  if (availability === "noCoordinates") {
    return (
      <div>
        {header}
        <div
          className={"mt-3 flex items-start gap-2.5 rounded-xl border border-dashed " +
            "bg-muted/20 px-4 py-3 text-sm text-muted-foreground"}
          style={{ maxWidth: 680 }}>
          <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t("attendance.autoClock.noCoordinates")}</span>
        </div>
      </div>
    )
  }

  // The switch saves the SAVED numbers with the new state — an unsaved draft is not smuggled in with it.
  const flip = (on: boolean) => {
    if (save.isPending) return
    setEnabled(on)
    save.mutate({ ...saved, enabled: on })
  }

  const check = autoClockSubmission(form, enabled)
  const invalid = check.ok ? null : check.field
  const shownError = invalid ?? refused
  const dirty = autoClockDirty(form, saved)
  const set = (patch: Partial<AutoClockForm>) => {
    setRefused(null)
    setForm((f) => ({ ...f, ...patch }))
  }

  return (
    <div>
      {header}
      <div className="mt-3 overflow-hidden rounded-xl border border-border" style={{ maxWidth: 680 }}>
        <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/30">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{t("attendance.autoClock.enable")}</span>
            <span className="block text-xs text-muted-foreground">{t("attendance.autoClock.enableHint")}</span>
          </span>
          <Switch
            checked={enabled}
            disabled={save.isPending}
            onCheckedChange={flip}
            aria-label={t("attendance.autoClock.enable")}
          />
        </label>

        {enabled && (
          <>
            {AUTO_CLOCK_FIELDS.map((f) => {
              const [min, max] = AUTO_CLOCK_LIMITS[f]
              const isRest = f === "autoRestMinutes"
              const off = isRest && !form.restOn
              const err = shownError === f ? autoClockFieldError(f, form) : null
              return (
                <div key={f} className="flex flex-wrap items-start gap-3 border-t border-border px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{t(autoClockFieldLabelKey(f))}</span>
                    <span className="block text-xs text-muted-foreground">{t(autoClockFieldHintKey(f))}</span>
                    {err && (
                      <span className="mt-1 block text-xs text-red-600 dark:text-red-400" role="alert">
                        {t(err.key, err.params)}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {isRest && (
                      <Switch
                        checked={form.restOn}
                        onCheckedChange={(v) => set({ restOn: v })}
                        aria-label={t(autoClockFieldLabelKey(f))}
                      />
                    )}
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={min}
                      max={max}
                      value={form[f]}
                      disabled={off}
                      onChange={(e) => set({ [f]: e.target.value } as Partial<AutoClockForm>)}
                      className={cn("h-9 w-20 tabular-nums", err && "border-red-500 focus-visible:ring-red-500/40")}
                      aria-label={t(autoClockFieldLabelKey(f))}
                      aria-invalid={!!err}
                    />
                    <span className={cn("w-8 text-xs text-muted-foreground", off && "opacity-50")}>{t("attendance.autoClock.min")}</span>
                  </span>
                </div>
              )
            })}
            {dirty && (
              <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
                <Button size="sm" variant="ghost" onClick={() => set(autoClockForm(saved))} disabled={save.isPending}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={() => check.ok && save.mutate(check.value)} disabled={!check.ok || save.isPending}>
                  {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground" style={{ maxWidth: 680 }}>
        {t("attendance.autoClock.note")}
      </p>
    </div>
  )
}
