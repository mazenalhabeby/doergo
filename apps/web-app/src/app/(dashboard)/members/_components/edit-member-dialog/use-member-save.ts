"use client"

import { keys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import {
  employeesApi,
  organizationsApi,
  type OrgMember,
  type UpdateMemberInput,
  type UpdateEmployeeInput,
  type ScheduleEntryInput,
} from "@/lib/api"
import type { MemberForm } from "./use-member-form"

/**
 * Saving the member editor: the member update, the worker profile beside it and
 * the weekly schedule — three endpoints fired from one Save.
 */
export function useMemberSave({
  member,
  form,
  isExternalMember,
  onClose,
  onSaved,
  clearPassword,
}: {
  member: OrgMember | null
  form: MemberForm
  isExternalMember: boolean
  onClose: () => void
  onSaved?: () => void
  /** Forget a temporary password once the dialog closes on a successful save. */
  clearPassword: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const {
    firstName,
    lastName,
    email,
    position,
    employerEntityId,
    dateOfBirth,
    scheduleType,
    monthlyHourBudget,
    scheduleRows,
    specialty,
    employmentType,
    leaveAllowance,
    employmentStartDate,
  } = form

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
      clearPassword()
      notify.success(t("members.memberEditor.updated"))
    },
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToUpdate")),
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

  return { updateMutation, handleSave }
}
