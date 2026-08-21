"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { WorkerAvatar, type WorkerAvatarProps } from "./worker-avatar"

export type TagVariant = "task" | "hrs" | "hrs-warn"

export interface PersonNodeTag {
  text: string
  variant: TagVariant
}

export type AbsenceReason = "time_off" | "sick" | "day_off" | "unexcused"

export interface PersonNodeProps extends WorkerAvatarProps {
  name: string
  tag?: PersonNodeTag
  absenceReason?: AbsenceReason
  userId?: string
  role?: string
  currentTask?: string
  dimmed?: boolean
  onPersonClick?: (userId: string) => void
  className?: string
  /**
   * Tells two people apart when their names do not — set ONLY for members whose
   * displayed name is shared by someone else on the same dashboard. Everyone
   * else renders exactly as before, so the common case gains no clutter.
   */
  subtitle?: string
  /**
   * Keep the subtitle's line in the layout even when this node has no subtitle.
   *
   * The cards lay people out on a CSS grid, so a row is as tall as its tallest
   * node. Without this, one disambiguated person would push their whole row
   * down and leave every status pill beside them sitting higher — the grid
   * looks broken for the sake of one extra line. The box sets it on all of its
   * people as soon as any one of them needs it.
   */
  reserveSubtitle?: boolean
}

const TAG_CLASSES: Record<TagVariant, string> = {
  task: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  hrs: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  "hrs-warn": "bg-amber-500/20 text-amber-600 dark:text-amber-400",
}

export const PersonNode = React.memo(function PersonNode({
  name,
  tag,
  dimmed,
  onPersonClick,
  userId,
  className,
  subtitle,
  reserveSubtitle,
  ...avatarProps
}: PersonNodeProps) {
  const isClickable = !!onPersonClick && !!userId

  // One activation path for pointer and keyboard, so the two can't drift.
  const activate = React.useCallback(
    (e: React.SyntheticEvent) => {
      if (!isClickable) return
      e.stopPropagation() // don't also expand/collapse the surrounding space card
      onPersonClick!(userId!)
    },
    [isClickable, onPersonClick, userId],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return
      // Space on a role="button" div scrolls the page unless the default is
      // suppressed — native <button> does this for us, a div does not.
      e.preventDefault()
      activate(e)
    },
    [activate],
  )

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={activate}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      className={cn(
        "flex flex-col items-center",
        // Width lives in one place: --ws-node in globals.css, the same value the
        // card builds its columns from. Wide enough for the longest status pill.
        "gap-1.5 ws-node",
        dimmed && "opacity-30",
        isClickable && "cursor-pointer hover:opacity-80 transition-opacity",
        className,
      )}
    >
      <WorkerAvatar {...avatarProps} />
      <span
        title={subtitle ? `${name} — ${subtitle}` : undefined}
        className="text-xs leading-tight text-foreground/70 truncate w-full text-center font-medium"
      >
        {name}
      </span>
      {/*
        The node is 84px wide (--ws-node), so this line is always at risk of
        being cut — a German or Spanish job title, or anything past roughly a
        dozen characters, will not fit. Truncating is the right failure: the
        full text is on the title of both this line and the name above it, and
        the whole node opens the person's profile on click. What must never
        happen is wrapping, which would silently change the height of one node
        and rag the grid row it sits in.
      */}
      {subtitle || reserveSubtitle ? (
        <span
          title={subtitle || undefined}
          className="block h-[11px] w-full truncate text-center text-[9px] leading-[11px] text-muted-foreground/70"
        >
          {subtitle ?? ""}
        </span>
      ) : null}
      <div className="min-h-[18px] flex w-full items-center justify-center">
        {tag ? (
          <span
            title={tag.text}
            className={cn(
              // Single line, ellipsis if it can't fit the node width — a long
              // "At {space}" label used to wrap to two lines and look cramped.
              "block max-w-full truncate text-[10px] font-bold leading-none px-1.5 py-1 rounded-full uppercase tracking-wide",
              TAG_CLASSES[tag.variant],
            )}
          >
            {tag.text}
          </span>
        ) : null}
      </div>
    </div>
  )
})
