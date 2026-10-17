"use client"

import { keys } from "@/lib/query-keys"
import { useCompanies } from "@/components/companies/company-select"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { createDefaultSchedule, type EditableScheduleRow } from "@/components/schedule-fields"
import {
  organizationsApi,
  employeesApi,
  type OrgMember,
  type UpdateMemberInput,
  type UpdateEmployeeInput,
  type ScheduleEntryInput,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { copyText } from "@/lib/clipboard"
import { useMemberEditorData } from "./edit-member-dialog/use-member-editor-data"
import { useEditMemberDialogData } from "./use-edit-member-dialog-data"

/** EditMemberDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useEditMemberDialog({
  member,
  isSelf,
  onClose,
  onSaved,
}: Pick<{
  member: OrgMember | null
  /** True when editing your own row — you can edit your profile but not your own role. */
  isSelf?: boolean
  onClose: () => void
  onSaved?: () => void
}, 'member' | 'isSelf' | 'onClose' | 'onSaved'>) {
  const {
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
  } = useEditMemberDialogData({ member, isSelf, onClose, onSaved })

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

  return {
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
  }
}
