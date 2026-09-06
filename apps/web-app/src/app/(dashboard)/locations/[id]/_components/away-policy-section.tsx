"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MapPin, Loader2 } from "lucide-react"

import { notify } from "@/lib/toast"
import { locationsApi } from "@/lib/api"
import { DEFAULT_GEOFENCE_POLICY, type GeofencePolicy } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { SectionHeader } from "./section-header"

/**
 * The CEILING on working away from this site.
 *
 * ⚠️ Not a permission, and the copy has to carry that or the setting will be
 * misread the first time somebody uses it: choosing "away is possible" grants
 * nothing to anybody. It makes an away day possible HERE, and the grant on each
 * member decides who may take one. Collapsing the two would hand remote
 * clock-in to everyone who works at the site the moment it was switched on.
 */
export function AwayPolicySection({
  space,
}: {
  space: { id: string; name: string; lat?: number | null; lng?: number | null; geofenceRadius?: number; geofencePolicy?: string | null }
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const hasPin = space.lat != null && space.lng != null
  const [policy, setPolicy] = useState<GeofencePolicy>(
    (space.geofencePolicy as GeofencePolicy) ?? DEFAULT_GEOFENCE_POLICY,
  )

  const save = useMutation({
    mutationFn: (next: GeofencePolicy) => locationsApi.update(space.id, { geofencePolicy: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", space.id] })
      qc.invalidateQueries({ queryKey: ["locations"] })
      notify.success(t("attendance.away.saved", "Saved"))
    },
    onError: (e: Error, next) => {
      notify.error(e.message)
      // Put the radio back where it was — a setting that appears to have saved
      // and did not is worse than one that visibly refused.
      setPolicy((p) => (p === next ? ((space.geofencePolicy as GeofencePolicy) ?? DEFAULT_GEOFENCE_POLICY) : p))
    },
  })

  const choose = (next: GeofencePolicy) => {
    if (next === policy || save.isPending) return
    setPolicy(next)
    save.mutate(next)
  }

  const OPTIONS: { value: GeofencePolicy; title: string; body: string }[] = [
    {
      value: "STRICT",
      title: t("attendance.away.strict", "Must be on site"),
      body: t(
        "attendance.away.strictHint",
        "Nobody may clock in away from here, whatever their account allows. For a site where being present is the work.",
      ),
    },
    {
      value: "AWAY_ALLOWED",
      title: t("attendance.away.allowed", "Away is possible here"),
      body: t(
        "attendance.away.allowedHint",
        "Only for members who are individually allowed it. Everyone else is still refused outside the ring. The day keeps its shift and its rests, and is flagged for review.",
      ),
    },
    {
      value: "NONE",
      title: t("attendance.away.none", "No geofence at all"),
      body: t("attendance.away.noneHint", "Nothing is checked when clocking in here."),
    },
  ]

  return (
    <div>
      <SectionHeader
        icon={MapPin}
        title={t("attendance.away.title", "Clocking in here")}
        description={
          hasPin
            ? t("attendance.away.subtitle", "What happens when somebody is not inside the {{radius}}m ring.", {
                radius: space.geofenceRadius ?? 0,
              })
            : t("attendance.away.noPin", "This workspace has no location on the map, so there is no ring to be outside of.")
        }
      />

      {hasPin ? (
        <div className="grid gap-2" style={{ maxWidth: 680 }}>
          {OPTIONS.map((o) => {
            const active = policy === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                disabled={save.isPending}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-primary" : "border-border",
                  )}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{o.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{o.body}</span>
                </span>
                {save.isPending && active && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
              </button>
            )
          })}

          {/*
            Said once, plainly, under the choice it qualifies. Without it the
            middle option reads as "let everyone here work from home".
          */}
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {t(
              "attendance.away.ceilingNote",
              "This decides what is possible at this workspace. Who may actually do it is set on each member, under Access.",
            )}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" />
          {t("attendance.away.noPinNote", "Add a location on the map to control this.")}
        </div>
      )}
    </div>
  )
}
