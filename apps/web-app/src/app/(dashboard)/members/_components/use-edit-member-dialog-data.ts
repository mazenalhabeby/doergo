"use client"

import { keys } from "@/lib/query-keys"
import { useCompanies } from "@/components/companies/company-select"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { createDefaultSchedule, type EditableScheduleRow } from "@/components/people/schedule-fields"
import {
  organizationsApi,
  employeesApi,
  type OrgMember,
  type UpdateMemberInput,
  type UpdateEmployeeInput,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useMemberEditorData } from "./edit-member-dialog/use-member-editor-data"

/** useEditMemberDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useEditMemberDialogData({
  member,
  isSelf,
  onClose,
  onSaved,
}: Pick<Pick<{
  member: OrgMember | null
  /** True when editing your own row — you can edit your profile but not your own role. */
  isSelf?: boolean
  onClose: () => void
  onSaved?: () => void
}, 'member' | 'isSelf' | 'onClose' | 'onSaved'>, 'member' | 'isSelf' | 'onClose' | 'onSaved'>) {
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

  return {
    t,
    queryClient,
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
    setCopied,
    specialty,
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
    workerMutation,
    updateMutation,
    resetPasswordMutation,
  }
}
