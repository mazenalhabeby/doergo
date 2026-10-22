"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, ChevronRight } from "lucide-react"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { portalAdminApi } from "@/lib/api"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { portalTile } from "@/lib/portal-ui"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TEMPLATES } from "../_lib/portal-templates"

/**
 * Change the portal's type: the picker shows the current one, and picking another asks before it
 * replaces the issue categories with the new type's defaults (clients and requests are kept).
 */
export function ChangePortalTypeDialog({
  spaceId,
  portalId,
  currentKey,
  open,
  onOpenChange,
}: {
  spaceId: string
  portalId: string
  /** The portal's type now. */
  currentKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // The Apartment entity used to need the Apartments module; that module is
  // retired and its records live in Assets now. A portal's own units are part
  // of the portal, so this gates on the portal itself.
  const { hasModule } = useSpaceModules(spaceId)
  const spaceHasApartments = hasModule("b2c_portal")
  const [switchOpen, setSwitchOpen] = useState<string | null>(null)
  const switchM = useMutation({
    mutationFn: (templateKey: string) => portalAdminApi.updatePortal(portalId, { templateKey, reseed: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.portal.detail(portalId) })
      setSwitchOpen(null)
      notify.success(t("portal.switched", "Type switched"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.changeType", "Change type")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {TEMPLATES.map((x) => {
              const isCurrent = x.key === currentKey
              const locked = x.key === "rental" && !spaceHasApartments && !isCurrent
              return (
                <button
                  key={x.key}
                  disabled={isCurrent || locked}
                  onClick={() => {
                    onOpenChange(false)
                    setSwitchOpen(x.key)
                  }}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                    isCurrent
                      ? "border-primary/40 bg-primary/5 cursor-default"
                      : locked
                        ? "cursor-not-allowed border-border opacity-60"
                        : "border-border hover:bg-accent/40"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(
                        x.accent,
                      )}`}
                    >
                      {x.badge}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground truncate">{x.label}</span>
                      {locked && (
                        <span className="block text-[11px] text-muted-foreground">
                          {t(
                            "portal.apartmentModuleRequired",
                            "Enable the Apartments module for this workspace to use this type.",
                          )}
                        </span>
                      )}
                    </span>
                  </span>
                  {isCurrent ? (
                    <span
                      className={"inline-flex items-center gap-1 text-[11px] font-medium text-primary " + "shrink-0"}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t("portal.currentType", "Current")}
                    </span>
                  ) : (
                    !locked && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "portal.changeTypeHint",
              "Switching replaces the issue categories with the new type's defaults. " +
                "Clients and their requests are kept.",
            )}
          </p>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!switchOpen}
        onOpenChange={(o) => !o && setSwitchOpen(null)}
        titleClassName="flex items-center gap-2"
        title={
          <>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t("portal.switchTitle", "Switch portal type?")}
          </>
        }
        description={t(
          "portal.switchWarn",
          "This replaces the issue categories with the new type’s defaults. Clients " + "and their requests are kept.",
        )}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("portal.switchConfirm", "Switch & reset categories")}
        onConfirm={() => switchOpen && switchM.mutate(switchOpen)}
        confirmDisabled={switchM.isPending}
      />
    </>
  )
}
