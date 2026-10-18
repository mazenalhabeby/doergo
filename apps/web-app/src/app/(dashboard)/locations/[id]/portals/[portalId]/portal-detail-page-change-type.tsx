"use client"

import { Check, ChevronRight } from "lucide-react"
import { portalTile } from "@/lib/portal-ui"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { TEMPLATES } from "./use-portal-detail-page"
import type { PortalDetailPageState } from "./use-portal-detail-page"

/** Part of PortalDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function PortalDetailPageChangeType({ vm }: { vm: PortalDetailPageState }) {
  const { typePickerOpen, setTypePickerOpen, t, meta, spaceHasApartments, setSwitchOpen } = vm
  return (
    <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("portal.changeType", "Change type")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {TEMPLATES.map((x) => {
            const isCurrent = x.key === meta.key
            const locked = x.key === "rental" && !spaceHasApartments && !isCurrent
            return (
              <button
                key={x.key}
                disabled={isCurrent || locked}
                onClick={() => {
                  setTypePickerOpen(false)
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
                  <span className={"inline-flex items-center gap-1 text-[11px] font-medium text-primary " + "shrink-0"}>
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
  )
}
