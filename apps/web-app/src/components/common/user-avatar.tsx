"use client"

import React from "react"
import { personInitials, personName } from "@hbcfield/shared/client"
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

/** Soft per-person tints (web redesign): calm tiles, the initials in the deep shade of the same hue. */
const SOFT_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
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

type AvatarSize = keyof typeof SIZES

// ─── Component ────────────────────────────────────────────────────────────

interface UserAvatarProps {
  firstName?: string | null
  lastName?: string | null
  avatarUrl?: string | null
  /** Deterministic seed for gradient color (use userId for consistency) */
  seed?: string
  size?: AvatarSize
  /** Show a ring around the avatar (useful for stacked avatars) */
  ring?: boolean
  /** A soft tint instead of the bright gradient (the shell's account button). */
  soft?: boolean
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
  soft = false,
  className,
  title,
}: UserAvatarProps) {
  const initials = personInitials({ firstName, lastName })
  const key = seed || `${firstName}${lastName}`
  const tone = soft
    ? SOFT_COLORS[hashStr(key) % SOFT_COLORS.length]!
    : cn("bg-gradient-to-br text-white", getGradient(key))
  const s = SIZES[size]

  // If the avatar image fails to load (broken URL / storage hiccup), fall back to
  // the initials instead of showing an empty gradient circle. Reset on url change.
  const [imgError, setImgError] = React.useState(false)
  React.useEffect(() => setImgError(false), [avatarUrl])

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden",
        tone,
        s.box,
        ring && "ring-[1.5px] ring-card",
        className,
      )}
      title={title || personName({ firstName, lastName })}
    >
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
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

interface StackedAvatarsProps {
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
