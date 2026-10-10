"use client"

import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"

import type { OrgMember } from "@/lib/api"
import { ConfirmDialog } from "@/components/confirm-dialog"

/** Confirming an ownership transfer, and confirming a removal. */
export function MemberConfirmDialogs({
  transferTarget, setTransferTarget, onTransfer, transferPending,
  removeTarget, setRemoveTarget, onRemove, removePending,
}: {
  transferTarget: OrgMember | null
  setTransferTarget: (m: OrgMember | null) => void
  onTransfer: (id: string) => void
  transferPending: boolean
  removeTarget: OrgMember | null
  setRemoveTarget: (m: OrgMember | null) => void
  onRemove: (id: string) => void
  removePending: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {/* ── Transfer Ownership Confirmation ────────────────────────────
          Irreversible without the new owner's cooperation: once it lands, only
          THEY can transfer it back. So the dialog states plainly what changes
          and what does not — you keep admin, you stop being the owner. */}
      <ConfirmDialog
        open={!!transferTarget}
        onOpenChange={(open) => !open && setTransferTarget(null)}
        title={t("members.owner.transfer", "Transfer ownership")}
        description={
          transferTarget &&
          t("members.owner.transferDesc", "{{name}} becomes the owner and an admin. You stay an admin.", {
            name: personName(transferTarget),
          })
        }
        cancelClassName="rounded-lg"
        confirmClassName="rounded-lg"
        confirmLabel={t("members.owner.transferConfirm", "Transfer")}
        onConfirm={() => transferTarget && onTransfer(transferTarget.id)}
        confirmDisabled={transferPending}
      />

      {/* ── Remove Confirmation ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t("members.removeTeamMember.title")}
        description={removeTarget && t("members.removeTeamMember.description", { name: personName(removeTarget) })}
        cancelClassName="rounded-lg"
        destructive
        confirmClassName="rounded-lg"
        confirmLabel={removePending ? t("common.removing") : t("members.actions.remove")}
        onConfirm={() => removeTarget && onRemove(removeTarget.id)}
        confirmDisabled={removePending}
      />
    </>
  )
}
