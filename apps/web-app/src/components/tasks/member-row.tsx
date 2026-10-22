"use client"

import { personName } from "@hbcfield/shared/client"
import React from "react"
import type { AssignablePerson } from "@/lib/assignable-members"
import { PersonPickRow } from "@/components/common/person-pick-row"

/** One person in the Assign dialog's list; a tick when they are selected. */
export const MemberRow = React.memo(function MemberRow({
  member,
  isCurrent,
  isAssigning,
  onAssign,
}: {
  member: AssignablePerson
  isCurrent: boolean
  isAssigning: boolean
  onAssign: (id: string) => void
}) {
  return (
    <PersonPickRow
      name={personName(member)}
      sub={member.position || member.specialty || member.role || member.email || ""}
      selected={isCurrent}
      onClick={() => onAssign(member.id)}
      avatar={{ firstName: member.firstName, lastName: member.lastName, avatarUrl: member.avatarUrl, seed: member.id }}
      disabled={isAssigning}
      className="gap-3 rounded-none px-4 py-3"
    />
  )
})
