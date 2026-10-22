"use client"

import { Loader2 } from "lucide-react"
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
import type { PortalDetailPageState } from "../_hooks/use-portal-detail-page"

/** Part of PortalDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function PortalDetailPageDeleteDialogTitle({ vm }: { vm: PortalDetailPageState }) {
  const {
    delPortalOpen,
    delPortalM,
    setDelPortalOpen,
    t,
    portal,
    clientCount,
    requestCount,
    delConfirmText,
    setDelConfirmText,
    canDeletePortal,
  } = vm
  return (
    <Dialog open={delPortalOpen} onOpenChange={(o) => !delPortalM.isPending && setDelPortalOpen(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("portal.deleteDialogTitle", "Delete “{{name}}”?", { name: portal?.name })}</DialogTitle>
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
              {t("portal.deleteConfirmLabel", "Type {{name}} to confirm", { name: portal?.name })}
            </Label>
            <Input
              id="portal-del-confirm"
              value={delConfirmText}
              onChange={(e) => setDelConfirmText(e.target.value)}
              placeholder={portal?.name}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDelPortalOpen(false)} disabled={delPortalM.isPending}>
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
