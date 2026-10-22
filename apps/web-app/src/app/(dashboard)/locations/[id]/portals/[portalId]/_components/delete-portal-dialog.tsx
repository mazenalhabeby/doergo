"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { portalAdminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

/** Delete the portal — the name must be typed to confirm. Clients keep their accounts but lose portal access. */
export function DeletePortalDialog({
  spaceId,
  portalId,
  portalName,
  clientCount,
  requestCount,
  open,
  onOpenChange,
  confirmText,
  setConfirmText,
  onDeleted,
}: {
  spaceId: string
  portalId: string
  portalName: string | undefined
  clientCount: number
  requestCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
  confirmText: string
  setConfirmText: (v: string) => void
  /** Where to go once it is gone. */
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const delPortalM = useMutation({
    mutationFn: () => portalAdminApi.deletePortal(portalId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: keys.spaces.portals(spaceId),
      })
      notify.success(t("portal.deleted", "Portal deleted"))
      onDeleted()
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const canDeletePortal = !!portalName && confirmText.trim() === portalName
  return (
    <Dialog open={open} onOpenChange={(o) => !delPortalM.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("portal.deleteDialogTitle", "Delete “{{name}}”?", { name: portalName })}</DialogTitle>
          <DialogDescription>
            {t(
              "portal.deletePortalWarn",
              "Deleting removes the portal and its categories. Clients keep their " +
                "accounts but lose portal access.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            {clientCount > 0 || requestCount > 0
              ? t(
                  "portal.deletePortalStats",
                  "This portal has {{clients}} client(s) and {{requests}} request(s). Their " +
                    "history is kept but they lose access here.",
                  { clients: clientCount, requests: requestCount },
                )
              : t("portal.deletePortalEmpty", "This portal has no clients or requests yet.")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="portal-del-confirm">
              {t("portal.deleteConfirmLabel", "Type {{name}} to confirm", { name: portalName })}
            </Label>
            <Input
              id="portal-del-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={portalName}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={delPortalM.isPending}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => delPortalM.mutate()}
            disabled={!canDeletePortal || delPortalM.isPending}
          >
            {delPortalM.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.deleting", "Deleting…")}
              </>
            ) : (
              t("portal.deletePortalButton", "Delete portal")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
