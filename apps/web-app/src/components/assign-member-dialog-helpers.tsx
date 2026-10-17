"use client"

import { personName } from "@hbcfield/shared/client"
import React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AssignablePerson } from "@/lib/assignable-members"
import { UserAvatar } from "@/components/user-avatar"

/** AssignMemberDialog's module-level helpers, moved here unchanged so its sections can read them too. */
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
  const title = member.position || member.specialty || member.role || member.email || ""

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 ease-out",
        isCurrent
          ? "bg-blue-50/80 dark:bg-blue-500/10"
          : "hover:bg-accent/50",
        isAssigning && "pointer-events-none opacity-60",
      )}
      onClick={() => onAssign(member.id)}
      disabled={isAssigning}
    >
      {/* Avatar */}
      <UserAvatar
        firstName={member.firstName}
        lastName={member.lastName}
        avatarUrl={member.avatarUrl}
        seed={member.id}
        size="md"
      />

      {/* Name + title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {personName(member)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{title}</p>
      </div>

      {/* Current assignee indicator */}
      {isCurrent && (
        <div className="flex-shrink-0">
          <Check className="size-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}
    </button>
  )
})
