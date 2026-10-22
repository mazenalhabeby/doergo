"use client"

import { formatDuration } from "@hbcfield/shared/client"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Coffee, Pencil, Trash2, BellRing, BellOff } from "lucide-react"

import { notify } from "@/lib/toast"
import { attendanceApi, type BreakRuleRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "../../../../../components/common/section-header"
import { keys } from "@/lib/query-keys"
import { RestDialog } from "./rest-dialog"

/**
 * The rests a workspace expects.
 *
 * This is the configuration half of the rest engine: what is planned, how long,
 * whether it is paid, and whether the member is asked. The other half — what one
 * person was actually asked to do today — is frozen onto their time entry at
 * clock-in and shown on their own shift page.
 *
 * A workspace with no rules here behaves exactly as this product did before
 * rests existed: breaks are taken when the member decides, and nothing prompts.
 */
export function RestsSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<BreakRuleRow | "new" | null>(null)

  const { data: rules, isLoading } = useQuery({
    queryKey: keys.schedules.breakRules(spaceId),
    queryFn: () => attendanceApi.listBreakRules({ spaceId }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => attendanceApi.deleteBreakRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.schedules.breakRules(spaceId) })
      notify.success(t("attendance.rests.removed", "Rest removed"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const active = (rules ?? []).filter((r) => r.isActive)

  return (
    <div>
      <SectionHeader
        icon={Coffee}
        title={t("attendance.rests.title", "Rests")}
        description={t(
          "attendance.rests.subtitle",
          "Planned for everyone working here. Members are asked when one falls due, " +
            "and a rest that doesn't count as work comes off their counted hours.",
        )}
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("attendance.rests.add", "Add a rest")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : active.length === 0 ? (
        <EmptyState
          icon={Coffee}
          title={t("attendance.rests.emptyTitle", "No rests planned")}
          description={t(
            "attendance.rests.emptyBody",
            "Nobody is prompted and nothing is deducted. Add one to have the day plan itself.",
          )}
        />
      ) : (
        <ul className="space-y-2">
          {active.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{rule.name}</span>
                  <Badge variant={rule.isPaid ? "secondary" : "outline"} className="text-[10px]">
                    {rule.isPaid
                      ? t("attendance.rests.paid", "Counts as work")
                      : t("attendance.rests.unpaid", "Doesn't count")}
                  </Badge>
                  {rule.isRequired && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("attendance.rests.required", "Required")}
                    </Badge>
                  )}
                  {rule.remind ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <BellRing className="h-3 w-3" />
                      {t("attendance.rests.remindEvery", "asks again every {{n}}m", { n: rule.snoozeMin })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <BellOff className="h-3 w-3" />
                      {t("attendance.rests.noReminder", "no reminder")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rule.trigger === "AFTER_WORKED"
                    ? t("attendance.rests.afterSummary", "{{mins}} minutes, after {{after}} of the shift", {
                        mins: rule.durationMinutes,
                        after: formatDuration(rule.afterMinutes ?? 0),
                      })
                    : t("attendance.rests.windowSummary", "{{mins}} minutes, any time between {{from}} and {{to}}", {
                        mins: rule.durationMinutes,
                        from: rule.earliestLocal ?? "—",
                        to: rule.latestLocal ?? t("attendance.rests.shiftEnd", "the end of the shift"),
                      })}
                </p>
              </div>

              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(rule)} aria-label={t("common.edit")}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(rule.id)}
                  disabled={remove.isPending}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RestDialog spaceId={spaceId} rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
