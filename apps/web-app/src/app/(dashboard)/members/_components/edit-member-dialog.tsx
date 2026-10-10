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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
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

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [position, setPosition] = useState("")
  // The company named on their contracts; null = the main company.
  const [employerEntityId, setEmployerEntityId] = useState<string | null>(null)
  const { main: mainCompany } = useCompanies()
  // "YYYY-MM-DD", or "" when the record holds no birthday.
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [scheduleType, setScheduleType] = useState("NONE")
  const [monthlyHourBudget, setMonthlyHourBudget] = useState<number | "">("")
  const [scheduleRows, setScheduleRows] = useState<EditableScheduleRow[]>(createDefaultSchedule())
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Worker fields (consolidated from the retired /employees editor).
  const [specialty, setSpecialty] = useState("")
  const [employmentType, setEmploymentType] = useState("EXTERNAL")
  // Empty string means "use the organization's default" — distinct from "0",
  // which is a real answer meaning no paid leave.
  const [leaveAllowance, setLeaveAllowance] = useState("")
  /*
    What this person bills and costs, per hour.

    ⚠️ Held as EUROS in the form and sent as CENTS, because that is what a
    person types and what money must be stored as. And empty string means
    "inherit from the level above" — distinct from "0", which is a real rate of
    nothing. Collapsing those two is how somebody who cleared a field ends up
    billing a client €0.

    ⚠️ Usually only COST is filled in here. The bill rate normally lives on the
    customer workspace, because that is the contract — and leaving this blank is
    what lets the client's rate win.
  */
  /*
    Works for a client or partner.

    Everything below that this hides describes an EMPLOYMENT we do not have with
    them: when they started here, the holiday we owe them, the hours we expect.
    Asking an admin to fill those in for somebody else's employee is asking a
    question with no true answer.
  */
  const isExternalMember = (member as { isExternal?: boolean } | null)?.isExternal === true
  const [employmentStartDate, setEmploymentStartDate] = useState("")

  // Initialize form whenever a (new) member is opened.
  useEffect(() => {
    if (!member) return
    setFirstName(member.firstName)
    setLastName(member.lastName)
    setEmail(member.email)
    setPosition(member.position || "")
    setEmployerEntityId(member.employerEntityId ?? null)
    setDateOfBirth((member.dateOfBirth || "").slice(0, 10))
    setScheduleType(member.scheduleType || "NONE")
    setMonthlyHourBudget(member.monthlyHourBudget ?? "")
    setScheduleRows(createDefaultSchedule())
    setTempPassword(null)
    setCopied(false)
    setSpecialty(member.specialty || "")
    setEmploymentType(member.employmentType || "EXTERNAL")
    const m = member as { leaveAllowance?: number | null; employmentStartDate?: string | null }
    setLeaveAllowance(m.leaveAllowance === null || m.leaveAllowance === undefined ? "" : String(m.leaveAllowance))
    setEmploymentStartDate(m.employmentStartDate ? String(m.employmentStartDate).slice(0, 10) : "")
  }, [member])


  // ── Data (self-contained; shared query keys dedupe across pages) ──
  const { memberRates, usedPositions, locations, allAssignments } = useMemberEditorData(member, canViewLabourCost)

  const { data: scheduleData } = useQuery({
    queryKey: keys.schedules.member(member?.id),
    queryFn: () => employeesApi.getSchedule(member!.id),
    enabled: !!member && scheduleType === "FIXED",
  })

  useEffect(() => {
    if (scheduleData?.schedule && scheduleData.schedule.length > 0) {
      const rows = createDefaultSchedule()
      for (const entry of scheduleData.schedule) {
        const row = rows[entry.dayOfWeek]
        if (row) {
          row.startTime = entry.startTime
          row.endTime = entry.endTime
          row.isActive = entry.isActive
        }
      }
      setScheduleRows(rows)
    }
  }, [scheduleData])

  // ── Mutations ──
  // Worker profile (specialty/employment/cost/maxJobs) — separate endpoint from
  // the member/role update; fired alongside it on save.
  const workerMutation = useMutation({
    mutationFn: (data: UpdateEmployeeInput) => employeesApi.update(member!.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members.detail(member?.id) }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberInput }) =>
      organizationsApi.updateMember(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.members.lists() })
      // The vacation allowance is edited here and rendered on the member's own
      // Vacation Requests page from a separately cached query — without this it
      // would keep showing the old entitlement.
      queryClient.invalidateQueries({ queryKey: keys.timeOff.myBalance() })
      onSaved?.()
      onClose()
      setTempPassword(null)
      notify.success(t("members.memberEditor.updated"))
    },
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToUpdate")),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.resetMemberPassword(memberId),
    onSuccess: (data) => {
      if (data?.temporaryPassword) {
        setTempPassword(data.temporaryPassword)
        setCopied(false)
      }
    },
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToResetPassword")),
  })

  const saveScheduleMutation = useMutation({
    mutationFn: ({ memberId, schedule }: { memberId: string; schedule: ScheduleEntryInput[] }) =>
      employeesApi.setSchedule(memberId, schedule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.schedules.member() }),
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToSaveSchedule")),
  })

  const handleSave = () => {
    if (!member) return
    // Login email: normalize once, validate shape client-side (server re-checks
    // shape + uniqueness) so a typo never reaches the network.
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return notify.error(t("members.memberEditor.invalidEmail", "Please enter a valid email address"))
    }
    if (scheduleType === "FIXED") {
      saveScheduleMutation.mutate({
        memberId: member.id,
        schedule: scheduleRows.map((row) => ({
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          isActive: row.isActive,
        })),
      })
    } else if (member.scheduleType === "FIXED") {
      // Switching away from a fixed schedule — clear the now-stale weekly rows
      // (the backend deletes-then-recreates, so an empty array wipes them).
      saveScheduleMutation.mutate({ memberId: member.id, schedule: [] })
    }
    updateMutation.mutate({
      memberId: member.id,
      data: {
        firstName,
        lastName,
        // Login email — only sent when edited (server re-checks uniqueness).
        ...(normalizedEmail && normalizedEmail !== member.email ? { email: normalizedEmail } : {}),
        position: position || undefined,
        // Only when it changed — an employer since switched off must not block saving the rest.
        ...(employerEntityId !== (member.employerEntityId ?? null) ? { employerEntityId } : {}),
        dateOfBirth: dateOfBirth || null,
        scheduleType,
        monthlyHourBudget:
          scheduleType === "FLEXIBLE" && monthlyHourBudget !== "" ? Number(monthlyHourBudget) : undefined,
        // Role is managed on the Access tab now — not sent from this profile editor.
      },
    })
    // Worker fields save via the technician update (specialty/employment/cost/maxJobs).
    const workerPatch: UpdateEmployeeInput = {
      specialty: specialty.trim() || undefined,
      employmentType,
      // "" clears the override back to the organization default; "0" is a real
      // value and must not be swallowed by a falsy check.
      /*
        Cleared for an external member rather than carried.

        The fields are hidden, but the state still holds whatever loaded — and a
        member converted to external later would keep a start date and a holiday
        entitlement nobody can see and nobody can correct. Hiding a control is
        not clearing it.
      */
      leaveAllowance: isExternalMember ? null : leaveAllowance.trim() === "" ? null : Number(leaveAllowance),
      employmentStartDate: isExternalMember ? null : employmentStartDate || null,
      /*
        ⚠️ The cost rate is NOT sent from here: it has its own dated Change
        control (it starts on a day and keeps its history). Sending it on every
        save also re-dated it "today" — and, from somebody without the labour
        cost permission, had the whole save refused.
      */
    }
    workerMutation.mutate(workerPatch)
  }

  const handleCopyPassword = async () => {
    if (!tempPassword) return
    if (!(await copyText(tempPassword))) return
    setCopied(true)
    notify.copied("password")
    setTimeout(() => setCopied(false), 3000)
  }

  const invalidateAssignments = () => queryClient.invalidateQueries({ queryKey: keys.locations.rosterBatches() })
  /*
    A cost lives on the PERSON and is read in several places: their profile,
    its dated history, and "Costs you" beside them in EVERY workspace they work
    in (["space-members", <space>]). Saving refreshes all of them — the
    workspace list otherwise kept the old figure for up to a minute.
  */
  const refreshMemberRates = () => {
    queryClient.invalidateQueries({ queryKey: keys.members.detail(member?.id) })
    queryClient.invalidateQueries({ queryKey: keys.rates.history("MEMBER", member?.id) })
    queryClient.invalidateQueries({ queryKey: keys.spaceMembers.all() })
    queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
  }

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
