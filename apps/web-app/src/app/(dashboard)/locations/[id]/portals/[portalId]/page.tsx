"use client"


import { AlertTriangle } from "lucide-react";

import { ConfirmDialog, ConfirmTargetDialog } from "@/components/common/confirm-dialog"
import { usePortalDetailPage } from "./_hooks/use-portal-detail-page";
import { PortalDetailPagePortal } from "./_components/portal-detail-page-portal"
import { PortalDetailPageInviteResident } from "./_components/portal-detail-page-invite-resident"
import { PortalDetailPageTriageTitle } from "./_components/portal-detail-page-triage-title"
import { PortalDetailPageChangeType } from "./_components/portal-detail-page-change-type"
import { PortalDetailPageDeleteDialogTitle } from "./_components/portal-detail-page-delete-dialog-title"
import { PortalDetailPageAddCategory } from "./_components/portal-detail-page-add-category"

export default function PortalDetailPage() {
  const vm = usePortalDetailPage()
  const {
    t,
    switchOpen,
    setSwitchOpen,
    switchM,
    catRemove,
    setCatRemove,
    delCatM,
    clientToRemove,
    setClientToRemove,
    removeClientM,
  } = vm

  return (
    <div className="min-h-full bg-background">
      <PortalDetailPagePortal vm={vm} />

      {/* Switch type */}
      {/* Change type picker — shows the current type; picking another flows into
          the reseed confirm below. */}
      <PortalDetailPageChangeType vm={vm} />

      <ConfirmDialog
        open={!!switchOpen}
        onOpenChange={(o) => !o && setSwitchOpen(null)}
        titleClassName="flex items-center gap-2"
        title={<><AlertTriangle className="h-4 w-4 text-amber-500" />{t("portal.switchTitle", "Switch portal type?")}</>}
        description={t(
          "portal.switchWarn",
          ("This replaces the issue categories with the new type’s defaults. Clients " + "and their requests are kept."))}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("portal.switchConfirm", "Switch & reset categories")}
        onConfirm={() => switchOpen && switchM.mutate(switchOpen)}
        confirmDisabled={switchM.isPending}
      />

      {/* Delete portal — type-the-name to confirm */}
      <PortalDetailPageDeleteDialogTitle vm={vm} />

      {/* Category add/edit */}
      <PortalDetailPageAddCategory vm={vm} />

      {/* Triage a pending request → live task */}
      <PortalDetailPageTriageTitle vm={vm} />

      {/* Category delete */}
      <ConfirmDialog
        open={!!catRemove}
        onOpenChange={(o) => !o && setCatRemove(null)}
        title={t("portal.deleteCategoryTitle", "Delete “{{label}}”?", { label: catRemove?.label })}
        description={t(
          "portal.deleteCategoryWarn",
          ("Clients can no longer pick this category for new requests. Existing " + "requests keep their category."))}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("common.delete", "Delete")}
        onConfirm={() => catRemove && delCatM.mutate(catRemove.id)}
        destructive
        confirmDisabled={delCatM.isPending}
      />

      {/* Remove client from the portal */}
      <ConfirmTargetDialog
        target={clientToRemove}
        onClose={() => setClientToRemove(null)}
        title={t("portal.removeClientTitle", "Remove {{name}} from this portal?", { name: clientToRemove?.name })}
        description={t(
          "portal.removeClientWarn",
          ("They immediately lose app access and are detached from this portal (any " +
            "apartment they held is freed). Their record and history are kept — you " +
            "can invite them again later."))}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("portal.removeClientConfirm", "Remove client")}
        mutation={removeClientM}
      />

      {/* Invite client */}
      <PortalDetailPageInviteResident vm={vm} />
    </div>
  )
}
