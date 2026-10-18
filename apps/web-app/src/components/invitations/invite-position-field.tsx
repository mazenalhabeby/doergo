"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CreateInvitationDialogState } from "./use-create-invitation-dialog"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function InvitePositionField({ vm }: { vm: CreateInvitationDialogState }) {
  const { t, position, handlePositionChange } = vm
  return (
    <>
      {/* Position / title */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("invitations.inviteDialog.positionLabel")}{" "}
          <span className="text-muted-foreground/50">{t("invitations.inviteDialog.optional")}</span>
        </Label>
        <Input
          placeholder={t("invitations.inviteDialog.positionPlaceholder")}
          value={position}
          onChange={(e) => handlePositionChange(e.target.value)}
          className="h-9"
        />
      </div>
    </>
  )
}
