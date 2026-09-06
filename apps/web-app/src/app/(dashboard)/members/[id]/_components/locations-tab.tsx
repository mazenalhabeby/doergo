"use client"

import { MapPin, CalendarDays, Building2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useTimeFormat } from "@/hooks"
import { locationsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { spaceAllowsAway, resolveAwayAccess } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

interface Assignment {
  id: string
  locationId: string
  isPrimary: boolean
  schedule: string[]
  effectiveFrom: string
  effectiveTo?: string
  /** true = allowed here · false = refused here · null = follow their account. */
  allowRemote?: boolean | null
  location: {
    id: string
    name: string
    address?: string
    lat?: number | null
    lng?: number | null
    geofencePolicy?: string | null
  }
}

interface LocationsTabProps {
  assignments: Assignment[] | undefined
  /** The member\'s account-level grant, which each assignment may override. */
  memberAllowRemote?: boolean
  /** Only an admin may change the grant; everyone else reads it. */
  canManage?: boolean
}

export function LocationsTab({ assignments, memberAllowRemote, canManage }: LocationsTabProps) {
  const { t } = useTranslation()
  const { formatDate } = useTimeFormat()
  const qc = useQueryClient()

  const setGrant = useMutation({
    mutationFn: ({ a, value }: { a: Assignment; value: boolean | null }) =>
      locationsApi.updateAssignment(a.locationId, a.id, { allowRemote: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-assignments"] })
      qc.invalidateQueries({ queryKey: ["all-location-assignments"] })
      notify.success(t("attendance.away.grantSaved", "Saved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MapPin className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('technicians.locationsTab.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('technicians.locationsTab.description')}</p>
        </div>
      </div>

      {assignments && assignments.length > 0 ? (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="group relative rounded-xl border border-border/60 bg-background/40 p-4 transition-all hover:border-primary/40 hover:shadow-md"
            >
              {/* Primary ribbon pill, top-right */}
              {assignment.isPrimary && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t('technicians.locationsTab.primary')}
                </span>
              )}

              {/* Icon + name + address */}
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0 transition-transform group-hover:scale-105">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 pr-14">
                  <p className="text-sm font-semibold text-foreground truncate">{assignment.location.name}</p>
                  {assignment.location.address && (
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{assignment.location.address}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Working days */}
              <div className="mt-3.5 flex flex-wrap gap-1">
                {assignment.schedule && assignment.schedule.length > 0 ? (
                  assignment.schedule.map((day) => (
                    <span
                      key={day}
                      className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
                    >
                      {day}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {t('technicians.locationsTab.allDays')}
                  </span>
                )}
              </div>

              {/*
                May they work away from THIS workspace?

                Three states, and each is shown with the reason it is what it is:
                the account answers by default, this assignment may override it,
                and the workspace\'s own ceiling can refuse the question
                entirely. A member told only "refused" cannot tell which of the
                three to ask about.
              */}
              <AwayGrantRow
                assignment={assignment}
                memberAllowRemote={memberAllowRemote}
                canManage={canManage}
                pending={setGrant.isPending}
                onChange={(value) => setGrant.mutate({ a: assignment, value })}
              />

              {/* Effective-from footer */}
              <div className="mt-3.5 pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                {t('technicians.locationsTab.effectiveFrom', { date: formatDate(assignment.effectiveFrom) })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
            <MapPin className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t('technicians.locationsTab.noAssignments')}</p>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * The per-workspace half of "may this person work away from a site".
 *
 * It shows the EFFECTIVE answer and the reason for it, because three different
 * things can produce a refusal and they are fixed by three different people:
 * the workspace\'s ceiling (an admin, on the workspace), the account grant (an
 * admin, on this member), and this override (here).
 */
function AwayGrantRow({
  assignment,
  memberAllowRemote,
  canManage,
  pending,
  onChange,
}: {
  assignment: Assignment
  memberAllowRemote?: boolean
  canManage?: boolean
  pending: boolean
  onChange: (value: boolean | null) => void
}) {
  const { t } = useTranslation()
  const loc = assignment.location
  const hasPin = loc.lat != null && loc.lng != null

  // A workspace that never admits an away day makes the whole question moot —
  // showing a control that cannot change the outcome is worse than showing none.
  if (!spaceAllowsAway(hasPin, loc.geofencePolicy)) {
    return (
      <div className="mt-3.5 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
        {t("attendance.away.siteStrictHere", "This workspace can only be clocked in at on site.")}
      </div>
    )
  }
  if (!hasPin) return null

  const effective = resolveAwayAccess({
    spaceHasPin: hasPin,
    policy: loc.geofencePolicy,
    userAllowRemote: memberAllowRemote,
    assignmentAllowRemote: assignment.allowRemote,
  })

  const OPTIONS: { value: boolean | null; label: string }[] = [
    { value: null, label: t("attendance.away.followAccount", "Account") },
    { value: true, label: t("attendance.away.allowHere", "Allow") },
    { value: false, label: t("attendance.away.refuseHere", "Refuse") },
  ]

  return (
    <div className="mt-3.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground">
          {t("attendance.away.mayWorkAway", "May work away from here")}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            effective.allowed
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {effective.allowed ? t("attendance.away.yes", "Allowed") : t("attendance.away.no", "Refused")}
        </span>
      </div>

      {canManage ? (
        <div className="mt-2 flex overflow-hidden rounded-md border border-border">
          {OPTIONS.map((o) => {
            const active = (assignment.allowRemote ?? null) === o.value
            return (
              <button
                key={String(o.value)}
                type="button"
                disabled={pending}
                onClick={() => onChange(o.value)}
                className={cn(
                  "flex-1 border-r border-border px-1 py-1.5 text-[10px] font-semibold last:border-r-0 transition-colors disabled:opacity-60",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/40",
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      ) : null}

      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        {assignment.allowRemote == null
          ? memberAllowRemote
            ? t("attendance.away.viaAccountOn", "Follows their account, which allows it.")
            : t("attendance.away.viaAccountOff", "Follows their account, which does not.")
          : assignment.allowRemote
            ? t("attendance.away.overrideOn", "Allowed here, whatever their account says.")
            : t("attendance.away.overrideOff", "Refused here, even though their account allows it.")}
      </p>
    </div>
  )
}
