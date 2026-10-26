"use client"

import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { useCompanies } from "@/components/companies/company-select"
import { UserAvatar } from "@/components/common/user-avatar"
import { ScheduleFields } from "@/components/people/schedule-fields"
import { type OrgMember } from "@/lib/api"
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
import { personName } from "@hbcfield/shared/client"
import { EditSection } from "./edit-member-dialog/edit-section"
import { EmploymentFields } from "./edit-member-dialog/employment-fields"
import { MemberSpacesSection } from "./edit-member-dialog/member-spaces-section"
import { MemberSecuritySection } from "./edit-member-dialog/member-security-section"
import { useMemberForm } from "./edit-member-dialog/use-member-form"
import { useMemberPasswordReset } from "./edit-member-dialog/use-member-password-reset"
import { useMemberSave } from "./edit-member-dialog/use-member-save"
import { useMemberEditorData } from "./edit-member-dialog/use-member-editor-data"

// Pieces live in ./edit-member-dialog/ — the position combobox, the profile
// box (employment + cost rates), the spaces and the password sections, the
// editor's reads, its form, the password reset and the save.

// ── Dialog ─────────────────────────────────────────────────────────────────────

/**
 * Self-contained Edit Member dialog — used by both the Members list and the
 * member detail page (so the same editor opens in place, no redirect).
 * Pass `member` to open; `null` keeps it closed.
 */
export function EditMemberDialog({
  member,
  onClose,
  onSaved,
}: {
  member: OrgMember | null
  /** True when editing your own row — you can edit your profile but not your own role. */
  isSelf?: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  /*
    ⚠️ The COST field is gated; the BILL field is not. What the work is worth is
    not a secret — an office manager who edits members needs it. What the
    company PAYS for that hour is a different question, and learning it should
    not be a side effect of being allowed to fix somebody's job title.

    The server strips cost from every invoice response on the same permission,
    so this is the screen agreeing with the boundary rather than enforcing it.
  */
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  /*
    Works for a client or partner.

    Everything below that this hides describes an EMPLOYMENT we do not have with
    them: when they started here, the holiday we owe them, the hours we expect.
    Asking an admin to fill those in for somebody else's employee is asking a
    question with no true answer.
  */
  const isExternalMember = (member as { isExternal?: boolean } | null)?.isExternal === true
  const { main: mainCompany } = useCompanies()

  const form = useMemberForm(member)
  const {
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
    dateOfBirth,
    setDateOfBirth,
    scheduleType,
    setScheduleType,
    monthlyHourBudget,
    setMonthlyHourBudget,
    scheduleRows,
    setScheduleRows,
    employmentType,
    setEmploymentType,
    leaveAllowance,
    setLeaveAllowance,
    employmentStartDate,
    setEmploymentStartDate,
  } = form
  const { tempPassword, setTempPassword, copied, resetPasswordMutation, handleCopyPassword } =
    useMemberPasswordReset(member)
  // ── Data (self-contained; shared query keys dedupe across pages) ──
  const { memberRates, usedPositions, locations, allAssignments } = useMemberEditorData(member, canViewLabourCost)
  const { updateMutation, handleSave } = useMemberSave({
    member,
    form,
    isExternalMember,
    onClose,
    onSaved,
    clearPassword: () => setTempPassword(null),
  })

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
              <UserAvatar
                firstName={member.firstName}
                lastName={member.lastName}
                avatarUrl={member.avatarUrl}
                seed={member.id}
                size="lg"
              />
              <div className="min-w-0">
                <DialogTitle className="text-base truncate flex items-center gap-2">
                  <span className="truncate">{personName(member)}</span>
                  {/* Says why the employment fields are absent, rather than
                      leaving an admin to wonder what happened to them. */}
                  {isExternalMember && (
                    <Badge
                      variant="outline"
                      className={
                        "shrink-0 border-transparent bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] " +
                        "px-1.5 py-0 text-[10px] font-medium text-shell-warn"
                      }
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
              <Label htmlFor="editFirstName" className="text-xs font-medium text-muted-foreground">
                {t("members.memberEditor.firstName")}
              </Label>
              <Input
                id="editFirstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-9 focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editLastName" className="text-xs font-medium text-muted-foreground">
                {t("members.memberEditor.lastName")}
              </Label>
              <Input
                id="editLastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-9 focus-visible:ring-offset-0"
              />
            </div>
            {/* Login email — spans both columns. Changing it changes how the
                member signs in, hence the inline hint. */}
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="editEmail" className="text-xs font-medium text-muted-foreground">
                {t("members.memberEditor.email", "Email")}
              </Label>
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
                <p className="text-[11px] text-shell-warn">
                  {t(
                    "members.memberEditor.emailChangeHint",
                    "This is the member's login — they will sign in with the new address.",
                  )}
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

          {member && <MemberSpacesSection member={member} locations={locations} allAssignments={allAssignments} />}

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
          <Button
            variant="outline"
            onClick={() => {
              onClose()
              setTempPassword(null)
            }}
            className="rounded-lg"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !firstName.trim() || !lastName.trim()}
            className="rounded-lg"
          >
            {updateMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
