"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { createDefaultSchedule, type EditableScheduleRow } from "@/components/people/schedule-fields"
import { employeesApi, type OrgMember } from "@/lib/api"

/**
 * The member editor's form: every field the save sends, filled from the member
 * whenever a (new) one is opened, and the weekly rows read from their fixed schedule.
 */
export function useMemberForm(member: OrgMember | null) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [position, setPosition] = useState("")
  // The company named on their contracts; null = the main company.
  const [employerEntityId, setEmployerEntityId] = useState<string | null>(null)
  // "YYYY-MM-DD", or "" when the record holds no birthday.
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [scheduleType, setScheduleType] = useState("NONE")
  const [monthlyHourBudget, setMonthlyHourBudget] = useState<number | "">("")
  const [scheduleRows, setScheduleRows] = useState<EditableScheduleRow[]>(createDefaultSchedule())
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
    setSpecialty(member.specialty || "")
    setEmploymentType(member.employmentType || "EXTERNAL")
    const m = member as { leaveAllowance?: number | null; employmentStartDate?: string | null }
    setLeaveAllowance(m.leaveAllowance === null || m.leaveAllowance === undefined ? "" : String(m.leaveAllowance))
    setEmploymentStartDate(m.employmentStartDate ? String(m.employmentStartDate).slice(0, 10) : "")
  }, [member])

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

  return {
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
    specialty,
    employmentType,
    setEmploymentType,
    leaveAllowance,
    setLeaveAllowance,
    employmentStartDate,
    setEmploymentStartDate,
  }
}

/** The member editor's form, as `useMemberForm` holds it. */
export type MemberForm = ReturnType<typeof useMemberForm>
