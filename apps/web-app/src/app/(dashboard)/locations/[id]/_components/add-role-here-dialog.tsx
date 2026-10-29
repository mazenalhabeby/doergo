"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { spaceRolesApi } from "@/lib/api"
import { formatMoney, MONEY_LOCALE } from "@/lib/money"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { roleQueryKey, useSpaceCurrency } from "@/components/spaces/work-roles"

const formatMoneyCents = (cents: number, currency: string) => formatMoney(cents, currency, MONEY_LOCALE)

/**
 * ONE way in: pick a company work role this workspace does not use yet, or create a new one. A role held
 * by nobody anywhere can be deleted from here.
 */
export function AddRoleHereDialog({
  spaceId,
  open,
  onOpenChange,
  notHere,
  duplicates,
  onDelete,
  onCreateNew,
}: {
  spaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The company's work roles not switched on here. */
  notHere: SpaceRoleInSpace[]
  /** Groups of work roles sharing one name — those are combined, never deleted from here. */
  duplicates: SpaceRoleInSpace[][]
  onDelete: (role: SpaceRoleInSpace) => void
  onCreateNew: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const money = useSpaceCurrency(spaceId)
  const useHere = useMutation({
    mutationFn: (roleId: string) => spaceRolesApi.useHere(spaceId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      queryClient.invalidateQueries({ queryKey: keys.organization.roleLists() })
      onOpenChange(false)
      notify.success(t("scheduling.workRoles.addedHere"))
    },
    onError: (err: Error) => notify.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scheduling.workRoles.addHere")}</DialogTitle>
          <DialogDescription>{t("scheduling.workRoles.addHereIntro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("scheduling.workRoles.companyRoles")}</p>
          {notHere.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t("scheduling.workRoles.allUsedHere")}</p>
          ) : (
            notHere.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  {r.dayRateCents != null && (
                    <span className="block text-xs text-muted-foreground">
                      {t("scheduling.workRoles.rateHere", {
                        rate: `${formatMoneyCents(r.dayRateCents, money.bill)} ${t("rates.perDay")}`,
                      })}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={useHere.isPending}
                    onClick={() => useHere.mutate(r.id)}
                  >
                    {t("scheduling.workRoles.useHere")}
                  </Button>
                  {/* Held by nobody, anywhere: it can go for good. */}
                  {r.inUseCount === 0 && !r.isSystem && !duplicates.some((g) => g.some((x) => x.id === r.id)) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      aria-label={t("common.delete")}
                      title={t("scheduling.workRoles.deleteUnused")}
                      onClick={() => {
                        onOpenChange(false)
                        onDelete(r)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false)
              onCreateNew()
            }}
          >
            <Plus className="h-4 w-4" />
            {t("scheduling.workRoles.createNew")}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
