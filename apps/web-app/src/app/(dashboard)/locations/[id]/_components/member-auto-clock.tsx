"use client"

import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clampDailyMinutes, parseAutoClockStartWindow, type AutoClockMode } from "@hbcfield/shared/client"

import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { locationsApi, type LocationAssignment } from "@/lib/api"
import type { UpdateAssignmentInput } from "@/lib/api/types/locations"
import { serverErrorMessage } from "@/lib/server-error"
import { formatMediumDate } from "@/lib/format-date"
import { autoClockAvailability, autoClockConsent, savedAutoClock } from "@/lib/auto-clock"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Segmented } from "@/components/ui/segmented"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

/** What the panel may change on a member: the automatic clock only. */
type AutoClockPatch = Partial<Pick<UpdateAssignmentInput, "autoClock" | "autoClockMode" | "autoClockStartWindow">>

/**
 * Is the automatic clock on in this workspace — and, when it is, each member's
 * switch and consent, from the workspace roster (`GET /locations/:id/members`,
 * the one read that carries `autoClockConsentAt`).
 *
 * ⚠️ The roster is read ONLY while the workspace has the automatic clock on, so
 * a workspace that never uses it pays no request. It shares its cache key with
 * the assignee picker (`keys.locations.roster`).
 */
export function useWorkspaceAutoClock(
  spaceId: string,
  space: { isRemote?: boolean | null; lat?: number | null; lng?: number | null; autoClock?: unknown; noShiftDailyMinutes?: number | null } | undefined,
) {
  const settings = savedAutoClock(space?.autoClock)
  const on = !!space && autoClockAvailability(space) === "ok" && settings.enabled
  // What a member clocked by arriving and leaving inherits from the workspace — shown, never copied.
  const workspace = {
    dwellMinutes: settings.dwellMinutes,
    exitGraceMinutes: settings.exitGraceMinutes,
    noShiftMinutes: clampDailyMinutes(space?.noShiftDailyMinutes),
  }
  const { data: roster } = useQuery({
    queryKey: keys.locations.roster(spaceId),
    queryFn: () => locationsApi.getAssignedMembers(spaceId),
    enabled: on,
    staleTime: 30_000,
  })
  const byUser = new Map((roster ?? []).map((r) => [r.userId, r]))
  return { on, workspace, rowFor: (userId: string | undefined) => (userId ? byUser.get(userId) : undefined) }
}

/** The member panel's "Automatic clock" block: the switch, and whether they agreed in the app. */
export function MemberAutoClock({
  spaceId,
  row,
  workspace,
  section,
  heading,
}: {
  spaceId: string
  /** This member's roster row — absent while it loads. */
  row: LocationAssignment | undefined
  /** The workspace's own numbers, from `useWorkspaceAutoClock`. */
  workspace: { dwellMinutes: number; exitGraceMinutes: number; noShiftMinutes: number }
  section: string
  heading: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const armed = row?.autoClock === true
  const consent = autoClockConsent(row)

  const update = useMutation({
    mutationFn: (patch: AutoClockPatch) =>
      locationsApi.updateAssignment(spaceId, row!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.locations.roster(spaceId) })
      qc.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      notify.success(t("attendance.noShift.saved", "Saved"))
    },
    onError: (e: Error) => notify.error(serverErrorMessage(e, t)),
  })

  return (
    <section className={section}>
      <h3 className={heading}>{t("attendance.autoClock.title")}</h3>
      <div className="flex items-center justify-between gap-3">
        <span>
          <Label htmlFor="member-auto-clock" className="text-sm text-muted-foreground">{t("attendance.autoClock.memberSwitch")}</Label>
          <span className="block text-[11px] text-muted-foreground">{t("attendance.autoClock.memberSwitchHint")}</span>
        </span>
        <Switch
          id="member-auto-clock"
          checked={armed}
          disabled={!row || row.autoClock === undefined || update.isPending}
          onCheckedChange={(v) => update.mutate({ autoClock: v })}
        />
      </div>
      {armed && row?.autoClockMode !== undefined && (
        <MemberAutoClockMode row={row} workspace={workspace} pending={update.isPending} save={(patch) => update.mutate(patch)} />
      )}
      {consent.state !== "unknown" && (
        <p
          className={
            consent.state === "agreed"
              ? "text-xs text-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          {consent.state === "agreed"
            ? t("attendance.autoClock.consentAgreed", { date: formatMediumDate(consent.at) })
            : t("attendance.autoClock.consentMissing")}
        </p>
      )}
    </section>
  )
}

/**
 * How this member is clocked here — by their shift, or by arriving and leaving
 * (no fixed shift) with their usual start hours. The longest session and the
 * waits are the WORKSPACE's, shown here and changed there, so one change on the
 * workspace applies to everybody at once.
 */
function MemberAutoClockMode({
  row,
  workspace,
  pending,
  save,
}: {
  row: LocationAssignment
  workspace: { dwellMinutes: number; exitGraceMinutes: number; noShiftMinutes: number }
  pending: boolean
  save: (patch: AutoClockPatch) => void
}) {
  const { t } = useTranslation()
  const mode: AutoClockMode = row.autoClockMode === "PRESENCE" ? "PRESENCE" : "SHIFT"
  const saved = row.autoClockStartWindow ?? null
  const [anyTime, setAnyTime] = useState(!saved)
  const [from, setFrom] = useState(saved?.from ?? "")
  const [to, setTo] = useState(saved?.to ?? "")
  // A save (or the server's suggestion when switching) refreshes the row: follow it.
  useEffect(() => {
    setAnyTime(!saved)
    setFrom(saved?.from ?? "")
    setTo(saved?.to ?? "")
  }, [saved?.from, saved?.to, saved])
  const window = anyTime ? null : { from, to }
  const valid = anyTime || (parseAutoClockStartWindow(window, { strict: true }).ok && !!from && !!to)
  const dirty = anyTime ? !!saved : saved?.from !== from || saved?.to !== to
  const hours = Math.round((workspace.noShiftMinutes / 60) * 10) / 10

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1.5">
        <Segmented
          ariaLabel={t("attendance.autoClock.modeLabel")}
          value={mode}
          disabled={pending}
          onChange={(v) => save({ autoClockMode: v })}
          options={[
            { value: "SHIFT", label: t("attendance.autoClock.modeShift") },
            { value: "PRESENCE", label: t("attendance.autoClock.modePresence") },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          {t(mode === "PRESENCE" ? "attendance.autoClock.modePresenceHint" : "attendance.autoClock.modeShiftHint")}
        </p>
      </div>
      {mode === "PRESENCE" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm">{t("attendance.autoClock.startWindow")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="auto-clock-from" type="time" className="h-8 w-28" value={from} disabled={anyTime || pending} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-muted-foreground">–</span>
              <Input id="auto-clock-to" type="time" className="h-8 w-28" value={to} disabled={anyTime || pending} onChange={(e) => setTo(e.target.value)} />
              <label htmlFor="auto-clock-any" className="flex items-center gap-1.5 text-sm">
                <Checkbox id="auto-clock-any" checked={anyTime} disabled={pending} onCheckedChange={(v) => setAnyTime(v === true)} />
                {t("attendance.autoClock.anyTime")}
              </label>
              {dirty && (
                <Button size="sm" className="h-8" disabled={!valid || pending} onClick={() => save({ autoClockStartWindow: window })}>
                  {t("attendance.autoClock.save")}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {!valid ? t("attendance.autoClock.windowInvalid") : t("attendance.autoClock.startWindowHint")}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-sm">{t("attendance.autoClock.longest", { hours })}</p>
            <p className="text-[11px] text-muted-foreground">{t("attendance.autoClock.longestHint")}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("attendance.autoClock.presenceTiming", { dwell: workspace.dwellMinutes, exit: workspace.exitGraceMinutes })}
          </p>
        </>
      )}
    </div>
  )
}
