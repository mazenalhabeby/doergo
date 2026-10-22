"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import type { SpaceRoleInSpace } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { spaceRolesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { roleQueryKey } from "./work-roles"

/** Merging a duplicate trade into another — its holders and day rates move. Asked twice before it happens. */
export function MergeRoleSection({
  spaceId,
  role,
  allRoles,
  onOpenChange,
}: {
  spaceId: string
  role: SpaceRoleInSpace | null
  allRoles: SpaceRoleInSpace[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!role
  // Merging a duplicate trade into another: holders and day rates move.
  const mergeTargets =
    isEdit && role!.kind === "WORK" && !role!.isSystem
      ? allRoles.filter((r) => r.kind === "WORK" && r.id !== role!.id)
      : []
  const [mergeInto, setMergeInto] = useState<string>("")
  const [confirmMerge, setConfirmMerge] = useState(false)
  const merge = useMutation({
    mutationFn: () => spaceRolesApi.merge(role!.id, mergeInto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: keys.organization.roleLists() })
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      notify.success(t("scheduling.workRoles.merged"))
      onOpenChange(false)
    },
    onError: (err: Error) => notify.error(err.message),
  })

  if (mergeTargets.length === 0) return null
  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3">
      <p className="text-xs font-medium text-foreground">{t("scheduling.workRoles.mergeTitle")}</p>
      <p className="text-[11px] text-muted-foreground">{t("scheduling.workRoles.mergeHint", { name: role!.name })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mergeInto}
          onValueChange={(v) => {
            setMergeInto(v)
            setConfirmMerge(false)
          }}
        >
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder={t("scheduling.workRoles.mergeChoose")} />
          </SelectTrigger>
          <SelectContent>
            {mergeTargets.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!confirmMerge ? (
          <Button size="sm" variant="outline" disabled={!mergeInto} onClick={() => setConfirmMerge(true)}>
            {t("scheduling.workRoles.mergeAction")}
          </Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={merge.isPending} onClick={() => merge.mutate()}>
            {merge.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("scheduling.workRoles.mergeConfirm", {
              name: role!.name,
              into: mergeTargets.find((r) => r.id === mergeInto)?.name ?? "",
            })}
          </Button>
        )}
      </div>
    </div>
  )
}
