"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Minus, Plus } from "lucide-react"
import { ROLE_SPOTS_MAX } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { tasksApi, type CandidateState } from "@/lib/api"
import { useFormatDistance } from "@/hooks/use-format-distance"
import { useWorkspaceWorkRoles } from "@/hooks/use-workspace-work-roles"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { keys } from "@/lib/query-keys"

export interface RoleAssignValue {
  roleId: string | null
  spots: number
}

const STATE_TONE: Record<CandidateState, string> = {
  FREE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  BUSY: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  NOT_WORKING: "bg-muted text-muted-foreground",
  ON_LEAVE: "bg-muted text-muted-foreground",
}

/**
 * "A Mechanic", not "Ahmad": choose a work role of the workspace and how many
 * people it needs (shared tasks/role-pool.ts).
 *
 * ⚠️ THE ORDER IS THE SERVER'S. Who is free, nearest and least loaded is read
 * from `role-preview`, ranked by the same rule that decides who is offered the
 * job — never re-ranked here, so the list on screen is the list that is pushed.
 * Read on choosing a role; nothing is fetched until then.
 */
export function RoleAssignField({
  spaceId,
  lat,
  lng,
  value,
  onChange,
  disabled,
}: {
  spaceId: string
  lat: number | null
  lng: number | null
  value: RoleAssignValue
  onChange: (v: RoleAssignValue) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const formatDistance = useFormatDistance()
  const { roles, loaded } = useWorkspaceWorkRoles(spaceId)
  const isLoading = !loaded
  const { data: preview } = useQuery({
    queryKey: keys.spaces.rolePreview(spaceId, value.roleId, lat, lng),
    queryFn: () => tasksApi.rolePreview({ spaceId, roleId: value.roleId!, lat, lng }),
    enabled: !!value.roleId,
    staleTime: 30_000,
  })
  const setSpots = (n: number) => onChange({ ...value, spots: Math.min(ROLE_SPOTS_MAX, Math.max(1, n)) })

  if (!isLoading && roles.length === 0) {
    return <p
      className={"rounded-lg border border-dashed border-border px-3 py-2 text-xs " + "text-muted-foreground"}>{t("tasks.role.noRoles")}</p>
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.role.role")}</Label>
          <Select value={value.roleId ?? ""} onValueChange={(roleId) => onChange({ ...value, roleId })} disabled={disabled}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
              <SelectValue placeholder={t("tasks.role.choose")} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} <span className="text-muted-foreground">· {t("tasks.role.holders", { count: r.holders })}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.role.people")}</Label>
          <div className="flex h-9 items-center rounded-lg border border-border bg-card">
            <button
              type="button"
              className="px-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() => setSpots(value.spots - 1)}
              disabled={disabled || value.spots <= 1}
              aria-label={t("tasks.role.fewer")}>
              <Minus className="size-3.5" />
            </button>
            <span className="w-6 text-center text-sm tabular-nums">{value.spots}</span>
            <button
              type="button"
              className="px-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() => setSpots(value.spots + 1)}
              disabled={disabled || value.spots >= ROLE_SPOTS_MAX}
              aria-label={t("tasks.role.more")}>
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {value.roleId && preview && (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="text-xs">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{t("tasks.role.freeNow", { count: preview.free })}</span>
            <span className="text-muted-foreground"> · {t("tasks.role.ofTotal", { count: preview.total })}</span>
            {preview.busy > 0 && <span className="text-muted-foreground"> · {t("tasks.role.busyCount", { count: preview.busy })}</span>}
          </p>
          {preview.candidates.length > 0 && (
            <ol className="mt-2 space-y-1">
              {preview.candidates.slice(0, 4).map((c, i) => (
                <li key={c.userId} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.distanceKm != null &&
                    <span className="tabular-nums text-muted-foreground">{formatDistance(c.distanceKm * 1000)}</span>}
                  <span
                    className={cn(
                      "rounded px-1.5 py-px text-[10px] font-medium",
                      STATE_TONE[c.state])}>{t(`tasks.role.state.${c.state}`)}</span>
                </li>
              ))}
            </ol>
          )}
          {/* More places than people who could ever fill them — said now, not discovered at the 30-minute alert. */}
          {value.spots > preview.total && (
            <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
              {t("tasks.role.moreThanHolders", { count: preview.total })}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">{t("tasks.role.offerHint")}</p>
        </div>
      )}
    </div>
  )
}
