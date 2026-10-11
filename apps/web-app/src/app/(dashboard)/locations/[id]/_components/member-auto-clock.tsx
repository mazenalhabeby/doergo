"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { locationsApi, type LocationAssignment } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { formatMediumDate } from "@/lib/format-date"
import { autoClockAvailability, autoClockConsent, savedAutoClock } from "@/lib/auto-clock"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

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
  space: { isRemote?: boolean | null; lat?: number | null; lng?: number | null; autoClock?: unknown } | undefined,
) {
  const on = !!space && autoClockAvailability(space) === "ok" && savedAutoClock(space.autoClock).enabled
  const { data: roster } = useQuery({
    queryKey: keys.locations.roster(spaceId),
    queryFn: () => locationsApi.getAssignedMembers(spaceId),
    enabled: on,
    staleTime: 30_000,
  })
  const byUser = new Map((roster ?? []).map((r) => [r.userId, r]))
  return { on, rowFor: (userId: string | undefined) => (userId ? byUser.get(userId) : undefined) }
}

/** The member panel's "Automatic clock" block: the switch, and whether they agreed in the app. */
export function MemberAutoClock({
  spaceId,
  row,
  section,
  heading,
}: {
  spaceId: string
  /** This member's roster row — absent while it loads. */
  row: LocationAssignment | undefined
  section: string
  heading: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const armed = row?.autoClock === true
  const consent = autoClockConsent(row)

  const update = useMutation({
    mutationFn: (autoClock: boolean) => locationsApi.updateAssignment(spaceId, row!.id, { autoClock }),
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
          onCheckedChange={(v) => update.mutate(v)}
        />
      </div>
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
