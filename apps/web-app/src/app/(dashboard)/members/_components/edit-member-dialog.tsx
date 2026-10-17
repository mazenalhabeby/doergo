"use client"

import { keys } from "@/lib/query-keys"
import { useCompanies } from "@/components/companies/company-select"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { UserAvatar } from "@/components/user-avatar"
import { ScheduleFields, createDefaultSchedule, type EditableScheduleRow } from "@/components/schedule-fields"
import {
  organizationsApi,
  employeesApi,
  type OrgMember,
  type UpdateMemberInput,
  type UpdateEmployeeInput,
  type ScheduleEntryInput,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { copyText } from "@/lib/clipboard"
import { personName } from "@hbcfield/shared/client"
import { EditSection } from "./edit-member-dialog/edit-section"
import { EmploymentFields } from "./edit-member-dialog/employment-fields"
import { MemberSpacesSection } from "./edit-member-dialog/member-spaces-section"
import { MemberSecuritySection } from "./edit-member-dialog/member-security-section"
import { useMemberEditorData } from "./edit-member-dialog/use-member-editor-data"
import { useEditMemberDialog } from "./use-edit-member-dialog"

// Pieces live in ./edit-member-dialog/ — the position combobox, the profile
// box (employment + cost rates), the spaces and the password sections, and the
// editor's reads.

// ── Dialog ─────────────────────────────────────────────────────────────────────

/**
 * Self-contained Edit Member dialog — used by both the Members list and the
 * member detail page (so the same editor opens in place, no redirect).
 * Pass `member` to open; `null` keeps it closed.
 */
export function EditMemberDialog({
  member,
  isSelf,
  onClose,
  onSaved,
}: {
  member: OrgMember | null
  /** True when editing your own row — you can edit your profile but not your own role. */
  isSelf?: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const {
    t,
    user,
    canViewLabourCost,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    position,
    setPosition,
    employerEntityId,
    setEmployerEntityId,
    mainCompany,
    dateOfBirth,
    setDateOfBirth,
    scheduleType,
    setScheduleType,
    monthlyHourBudget,
    setMonthlyHourBudget,
    scheduleRows,
    setScheduleRows,
    tempPassword,
    setTempPassword,
    copied,
    employmentType,
    setEmploymentType,
    leaveAllowance,
    setLeaveAllowance,
    isExternalMember,
    employmentStartDate,
    setEmploymentStartDate,
    memberRates,
    usedPositions,
    locations,
    allAssignments,
    updateMutation,
    resetPasswordMutation,
    handleSave,
    handleCopyPassword,
    invalidateAssignments,
    refreshMemberRates,
  } = useEditMemberDialog({ member, isSelf, onClose, onSaved })

  return (
    <Dialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setTempPassword(null)
        }
      }}
    >
      <DialogContent className="px-6">
        <DialogHeader>
          {member && (
            <div className="flex items-center gap-3 text-left">
              <UserAvatar firstName={member.firstName} lastName={member.lastName} avatarUrl={member.avatarUrl} seed={member.id} size="lg" />
              <div className="min-w-0">
                <DialogTitle className="text-base truncate flex items-center gap-2">
                  <span className="truncate">{personName(member)}</span>
                  {/* Says why the employment fields are absent, rather than
                      leaving an admin to wonder what happened to them. */}
                  {isExternalMember && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] font-medium border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0"
                    >
                      {t("members.external.badge")}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs truncate">{member.email}</DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto overflow-x-hidden px-1">
          <EditSection label={t("members.memberEditor.sectionProfile")} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="editFirstName" className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.firstName")}</Label>
              <Input id="editFirstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 focus-visible:ring-offset-0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editLastName" className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.lastName")}</Label>
              <Input id="editLastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9 focus-visible:ring-offset-0" />
            </div>
            {/* Login email — spans both columns. Changing it changes how the
                member signs in, hence the inline hint. */}
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="editEmail" className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.email", "Email")}</Label>
              <Input
                id="editEmail"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 focus-visible:ring-offset-0"
              />
              {email.trim().toLowerCase() !== member?.email && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  {t("members.memberEditor.emailChangeHint", "This is the member's login — they will sign in with the new address.")}
                </p>
              )}
            </div>
          </div>

          {/* Job title — a free-text designation (e.g. "Logistics Manager",
              "Team Lead") independent of the permission role. */}
          <EmploymentFields
            member={member}
            orgUsesExternalWorkers={user?.orgUsesExternalWorkers}
            orgCurrency={user?.orgCurrency}
            canViewLabourCost={canViewLabourCost}
            isExternalMember={isExternalMember}
            mainCompany={mainCompany}
            usedPositions={usedPositions}
            memberRates={memberRates}
            refreshMemberRates={refreshMemberRates}
            position={position}
            setPosition={setPosition}
            employerEntityId={employerEntityId}
            setEmployerEntityId={setEmployerEntityId}
            dateOfBirth={dateOfBirth}
            setDateOfBirth={setDateOfBirth}
            employmentType={employmentType}
            setEmploymentType={setEmploymentType}
            employmentStartDate={employmentStartDate}
            setEmploymentStartDate={setEmploymentStartDate}
            leaveAllowance={leaveAllowance}
            setLeaveAllowance={setLeaveAllowance}
          />

          {/* A schedule is the hours WE expect. Theirs are their own employer's
              business, and a rota line for somebody who never appears raises
              no-shows against a company that owes us no attendance. */}
          {!isExternalMember && (
            <>
              <EditSection label={t("members.memberEditor.sectionWorkSchedule")} />

              <ScheduleFields
                scheduleType={scheduleType}
                onScheduleTypeChange={setScheduleType}
                scheduleRows={scheduleRows}
                onScheduleRowsChange={setScheduleRows}
                monthlyHourBudget={monthlyHourBudget}
                onMonthlyHourBudgetChange={setMonthlyHourBudget}
              />
            </>
          )}

          {/* Role & remote clock-in now live on the member's Access tab — the
              single home for role + permissions. This dialog stays profile-only. */}

          {member && (
            <MemberSpacesSection
              member={member}
              locations={locations}
              allAssignments={allAssignments}
              invalidateAssignments={invalidateAssignments}
            />
          )}

          <EditSection label={t("members.memberEditor.sectionSecurity")} />

          <MemberSecuritySection
            tempPassword={tempPassword}
            copied={copied}
            isResetting={resetPasswordMutation.isPending}
            onReset={() => member && resetPasswordMutation.mutate(member.id)}
            onCopy={handleCopyPassword}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setTempPassword(null) }} className="rounded-lg">
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !firstName.trim() || !lastName.trim()} className="rounded-lg">
            {updateMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
