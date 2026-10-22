"use client"

import type { ReactNode } from "react"
import { Check } from "lucide-react"
import { personInitials } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/common/user-avatar"

/** A member's own picture, when the row is a member (a client record has none). */
export interface PickRowAvatar {
  firstName?: string | null
  lastName?: string | null
  avatarUrl?: string | null
  seed?: string
}

/**
 * One person in a pick list — an asset's holder, an apartment's resident, a contact to link,
 * the member to assign: their picture (or initials), name, a second line, and a tick when chosen.
 * The one row every pick list uses; `className` sets its padding where the list is edge to edge.
 */
export function PersonPickRow({
  name,
  sub,
  selected,
  onClick,
  avatar,
  disabled = false,
  className,
}: {
  name: string
  sub: ReactNode
  selected: boolean
  onClick: () => void
  avatar?: PickRowAvatar
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
        selected ? "bg-primary/10" : "hover:bg-muted",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      {avatar ? (
        <UserAvatar
          firstName={avatar.firstName}
          lastName={avatar.lastName}
          avatarUrl={avatar.avatarUrl}
          seed={avatar.seed}
          size="md"
        />
      ) : (
        <span
          className={
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
            "bg-primary/10 text-[10px] font-semibold text-primary"
          }
        >
          {personInitials(name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}
