"use client"

import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"

import type { OrgMember } from "@/lib/api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
      <AlertDialog
        open={!!transferTarget}
        onOpenChange={(open) => !open && setTransferTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("members.owner.transfer", "Transfer ownership")}</AlertDialogTitle>
            <AlertDialogDescription>
              {transferTarget &&
                t("members.owner.transferDesc", "{{name}} becomes the owner and an admin. You stay an admin.", {
                  name: personName(transferTarget),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              onClick={() => transferTarget && onTransfer(transferTarget.id)}
              disabled={transferPending}
            >
              {t("members.owner.transferConfirm", "Transfer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Remove Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("members.removeTeamMember.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget &&
                t("members.removeTeamMember.description", { name: personName(removeTarget) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 rounded-lg"
              onClick={() => removeTarget && onRemove(removeTarget.id)}
              disabled={removePending}
            >
              {removePending ? t("common.removing") : t("members.actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
