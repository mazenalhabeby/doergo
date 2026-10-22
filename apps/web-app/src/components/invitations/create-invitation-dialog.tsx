"use client"

import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScheduleFields } from "@/components/people/schedule-fields"
import { useCreateInvitationDialog, type CreateInvitationDialogProps } from "./use-create-invitation-dialog"
import { InvitationCreated } from "./invitation-created"
import { InviteContactFields } from "./invite-contact-fields"
import { InviteWhoField } from "./invite-who-field"
import { InviteWorkspaceField } from "./invite-workspace-field"
import { ExternalRoleFields } from "./external-role-fields"
import { InviteAccessSection } from "./invite-access-section"

export function CreateInvitationDialog({ open, onOpenChange }: CreateInvitationDialogProps) {
  const {
    mode,
    setMode,
    email,
    setEmail,
    position,
    isExternal,
    setIsExternal,
    scheduleType,
    setScheduleType,
    scheduleRows,
    setScheduleRows,
    monthlyHourBudget,
    setMonthlyHourBudget,
    spaceId,
    setSpaceId,
    externalRoleId,
    setExternalRoleId,
    externalMode,
    setExternalMode,
    externalChoice,
    setExternalChoice,
    access,
    setAccess,
    accessOpen,
    setAccessOpen,
    patchAccess,
    generatedCode,
    success,
    codeCopied,
    locations,
    hasSpace,
    builderModules,
    spaceRoles,
    createMutation,
    handleSubmit,
    handlePositionChange,
    handleCopyCode,
    handleSendAnother,
    handleClose,
  } = useCreateInvitationDialog({ open, onOpenChange })
  const { t } = useTranslation()

  // ─── Success view ──────────────────────────────────────────────────────

  if (success && generatedCode) {
    return (
      <InvitationCreated
        open={open}
        onClose={handleClose}
        mode={mode}
        email={email}
        generatedCode={generatedCode}
        codeCopied={codeCopied}
        onCopyCode={handleCopyCode}
        onSendAnother={handleSendAnother}
      />
    )
  }

  // ─── Form view ─────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitations.inviteDialog.title")}</DialogTitle>
          <DialogDescription>{t("invitations.inviteDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          <InviteContactFields
            mode={mode}
            setMode={setMode}
            email={email}
            setEmail={setEmail}
            position={position}
            onPositionChange={handlePositionChange}
          />

          {/* Staff, or somebody else's */}
          <InviteWhoField
            isExternal={isExternal}
            setIsExternal={setIsExternal}
            setScheduleType={setScheduleType}
            setAccess={setAccess}
          />

          {/* Schedule — same control as the Edit dialog (type + weekly hours /
              budget). Not for an external member: a schedule is the hours WE
              expect somebody to work, and this person's hours are their own
              employer's business. They come to approve ours, not to file
              theirs — they never clock in, so a rota line for them would sit
              permanently unmet and start raising no-shows against a company
              that owes us no attendance. */}
          {!isExternal && (
            <ScheduleFields
              scheduleType={scheduleType}
              onScheduleTypeChange={setScheduleType}
              scheduleRows={scheduleRows}
              onScheduleRowsChange={setScheduleRows}
              monthlyHourBudget={monthlyHourBudget}
              onMonthlyHourBudgetChange={setMonthlyHourBudget}
            />
          )}

          {/* Space (optional) */}
          {locations.length > 0 && (
            <InviteWorkspaceField
              locations={locations}
              spaceId={spaceId}
              setSpaceId={setSpaceId}
              isExternal={isExternal}
              hasSpace={hasSpace}
            />
          )}

          {/*
            What an outsider may do — only meaningful for an external invite, and
            only once the workspace is chosen (the builder greys out what that
            workspace does not run).
          */}
          {isExternal && hasSpace && (
            <ExternalRoleFields
              externalMode={externalMode}
              setExternalMode={setExternalMode}
              spaceRoles={spaceRoles}
              email={email}
              externalChoice={externalChoice}
              setExternalChoice={setExternalChoice}
              builderModules={builderModules}
              access={access}
              patchAccess={patchAccess}
              externalRoleId={externalRoleId}
              setExternalRoleId={setExternalRoleId}
            />
          )}

          <InviteAccessSection
            isExternal={isExternal}
            access={access}
            patchAccess={patchAccess}
            accessOpen={accessOpen}
            setAccessOpen={setAccessOpen}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="rounded-lg">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              createMutation.isPending ||
              (mode === "email" && !email.trim()) ||
              // An external member's whole authority is one space assignment. An
              // invite without one creates somebody who works for a client, has
              // a login, and can reach nothing — a dead account that looks fine.
              (isExternal && !hasSpace)
            }
            data-tour="members-invite-send"
            className="rounded-lg"
          >
            {createMutation.isPending
              ? mode === "email"
                ? t("invitations.inviteDialog.sending")
                : t("common.generating")
              : mode === "email"
                ? t("invitations.inviteDialog.sendInvitation")
                : t("invitations.inviteDialog.generateCode")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
