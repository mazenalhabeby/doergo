"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Copy, Check, CheckCircle2, Mail, Link2, ChevronDown, ShieldCheck } from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import {
  invitationsApi,
  organizationsApi,
  type CreateInvitationInput,
  type CompanyLocation,
  type AccessRole,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScheduleFields, createDefaultSchedule, type EditableScheduleRow } from "@/components/schedule-fields"
import { AccessFields } from "@/components/access-fields"
import { defaultAccessDraft, serializeAccessDraft, getDefaultModules, permissionsFromChoice } from "@hbcfield/shared/client"
import type { AccessDraft, PermissionChoice } from "@hbcfield/shared/client"
import { presetChoice, withoutMissingModules } from "@/lib/permission-builder"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { copyText } from "@/lib/clipboard"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { useCreateInvitationDialog, type CreateInvitationDialogProps } from "./use-create-invitation-dialog"
import { PermissionBuilder } from "./create-invitation-dialog-helpers"
import { CreateInvitationDialogInviteDialog } from "./create-invitation-dialog-invite-dialog"

export function CreateInvitationDialog({ open, onOpenChange }: CreateInvitationDialogProps) {
  const vm = useCreateInvitationDialog({ open, onOpenChange })
  const {
    t,
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
    spaceModules,
    builderModules,
    spaceRoles,
    createMutation,
    handleSubmit,
    handlePositionChange,
    platformSummary,
    handleCopyCode,
    handleSendAnother,
    handleClose,
  } = vm

  // ─── Success view ──────────────────────────────────────────────────────

  if (success && generatedCode) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invitations.inviteDialog.title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {mode === "email" && email ? (
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("invitations.inviteDialog.invitationSent")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("invitations.inviteDialog.emailSentToPrefix")} <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>
                <div className="bg-muted/60 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">{t("invitations.inviteDialog.codeAlsoInEmail")}</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-xl font-mono font-bold tracking-[0.15em] text-foreground">{generatedCode}</p>
                    <Button variant="ghost" size="icon" onClick={handleCopyCode} className="h-7 w-7">
                      {codeCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("invitations.inviteDialog.codeCreated")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("invitations.inviteDialog.shareCode")}</p>
                </div>
                <div className="bg-muted/60 rounded-xl p-5">
                  <p className="text-3xl font-mono font-bold tracking-[0.2em] text-foreground">{generatedCode}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleSendAnother} className="flex-1 rounded-lg">
                {mode === "email" ? t("invitations.inviteDialog.sendAnother") : t("invitations.inviteDialog.createAnother")}
              </Button>
              {mode === "code" && (
                <Button variant="outline" onClick={handleCopyCode} className="rounded-lg">
                  {codeCopied ? <><Check className="h-4 w-4 mr-1.5 text-green-600" />{t("common.copied")}</> : <><Copy className="h-4 w-4 mr-1.5" />{t("common.copy")}</>}
                </Button>
              )}
              <Button onClick={handleClose} className="flex-1 rounded-lg">{t("common.done")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

        <CreateInvitationDialogInviteDialog vm={vm} />

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="rounded-lg">{t("common.cancel")}</Button>
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
              ? mode === "email" ? t("invitations.inviteDialog.sending") : t("common.generating")
              : mode === "email" ? t("invitations.inviteDialog.sendInvitation") : t("invitations.inviteDialog.generateCode")
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
