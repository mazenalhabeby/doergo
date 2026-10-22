"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Home } from "lucide-react"
import { spacePortalApi, type SpaceUnit } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { keys } from "@/lib/query-keys"

/** Assign an existing unit (apartment) from the space catalog to this customer. */
export function AssignDialog({
  spaceId,
  customerId,
  entityLabel,
  onSaved,
  trigger,
}: {
  spaceId: string
  customerId: string
  entityLabel: string
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const unitsQ = useQuery({
    queryKey: keys.spaces.units(spaceId),
    queryFn: () => spacePortalApi.units(spaceId),
    enabled: open,
  })
  // Vacant = no client AND no member resident (never offer a member's home).
  const vacant = (unitsQ.data ?? []).filter((u: SpaceUnit) => !u.customerId && !u.residentUserId)

  const assign = useMutation({
    mutationFn: (unitId: string) => spacePortalApi.assign(spaceId, unitId, customerId),
    onSuccess: () => {
      notify.success(t("customers.assigned", "Assigned"))
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message || "Could not assign"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("customers.assignEntity", "Assign {{label}}", { label: entityLabel })}</DialogTitle>
        </DialogHeader>
        {unitsQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : vacant.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("customers.noVacant", "No vacant {{label}}. Add one in the space's Client portal tab.", {
              label: entityLabel.toLowerCase() + "s",
            })}
          </p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {vacant.map((u: SpaceUnit) => (
              <button
                key={u.id}
                disabled={assign.isPending}
                onClick={() => assign.mutate(u.id)}
                className={
                  "flex w-full items-center gap-3 rounded-lg border border-border p-3 " +
                  "text-left transition-colors hover:border-primary hover:bg-muted/50"
                }
              >
                <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                  {u.address && u.address !== u.name && (
                    <p className="truncate text-xs text-muted-foreground">{u.address}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
