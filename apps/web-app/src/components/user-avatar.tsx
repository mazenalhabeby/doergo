"use client"

import React from "react"
import { cn } from "@/lib/utils"

// ─── Deterministic color from user ID or name ─────────────────────────────

const AVATAR_COLORS = [
  "from-blue-500 to-blue-600",
  "from-violet-500 to-violet-600",
  "from-emerald-500 to-emerald-600",
  "from-amber-500 to-amber-600",
  "from-rose-500 to-rose-600",
  "from-cyan-500 to-cyan-600",
  "from-fuchsia-500 to-fuchsia-600",
  "from-teal-500 to-teal-600",
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function getGradient(seed: string): string {
  return AVATAR_COLORS[hashStr(seed) % AVATAR_COLORS.length]!
}

// ─── Size presets ─────────────────────────────────────────────────────────

const SIZES = {
  xs:  { box: "size-5",  text: "text-[8px]",  font: "font-semibold" },
  sm:  { box: "size-6",  text: "text-[9px]",  font: "font-semibold" },
  md:  { box: "size-8",  text: "text-[11px]", font: "font-semibold" },
  lg:  { box: "size-10", text: "text-sm",      font: "font-bold" },
  xl:  { box: "size-14", text: "text-lg",      font: "font-bold" },
  "2xl": { box: "size-16", text: "text-xl",    font: "font-bold" },
} as const

export type AvatarSize = keyof typeof SIZES

// ─── Component ────────────────────────────────────────────────────────────

export interface UserAvatarProps {
  firstName?: string | null
  lastName?: string | null
  avatarUrl?: string | null
  /** Deterministic seed for gradient color (use userId for consistency) */
  seed?: string
  size?: AvatarSize
  /** Show a ring around the avatar (useful for stacked avatars) */
  ring?: boolean
  className?: string
  title?: string
}

export const UserAvatar = React.memo(function UserAvatar({
  firstName,
  lastName,
  avatarUrl,
  seed,
  size = "md",
  ring = false,
  className,
  title,
}: UserAvatarProps) {
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?"
  const gradient = getGradient(seed || `${firstName}${lastName}`)
  const s = SIZES[size]

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gradient-to-br text-white",
        gradient,
        s.box,
        ring && "ring-[1.5px] ring-card",
        className,
      )}
      title={title || `${firstName || ""} ${lastName || ""}`.trim()}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={cn(s.text, s.font, "leading-none select-none")}>
          {initials}
        </span>
      )}
    </div>
  )
})

// ─── Stacked avatars (for multi-assignee displays) ────────────────────────

export interface StackedAvatarsProps {
  users: {
    id?: string
    firstName?: string | null
    lastName?: string | null
    avatarUrl?: string | null
  }[]
  max?: number
  size?: AvatarSize
  className?: string
}

export const StackedAvatars = React.memo(function StackedAvatars({
  users,
  max = 3,
  size = "xs",
  className,
}: StackedAvatarsProps) {
  const visible = users.slice(0, max)
  const overflow = users.length - max

  return (
    <div className={cn("flex -space-x-1.5", className)}>
      {visible.map((u, i) => (
        <UserAvatar
          key={u.id || i}
          firstName={u.firstName}
          lastName={u.lastName}
          avatarUrl={u.avatarUrl}
          seed={u.id}
          size={size}
          ring
        />
      ))}
      {overflow > 0 && (
        <div className={cn(
          "rounded-full bg-muted flex items-center justify-center flex-shrink-0 ring-[1.5px] ring-card",
          SIZES[size].box,
        )}>
          <span className={cn(SIZES[size].text, "font-semibold text-muted-foreground leading-none")}>
            +{overflow}
          </span>
        </div>
      )}
    </div>
  )
})
