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
  ...avatarProps
}: PersonNodeProps) {
  const isClickable = !!onPersonClick && !!userId

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (isClickable) {
        e.stopPropagation()
        onPersonClick!(userId!)
      }
    },
    [isClickable, onPersonClick, userId],
  )

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onPersonClick!(userId!) } } : undefined}
      className={cn(
        "flex flex-col items-center",
        "gap-1.5 w-[84px]", // fixed size — no cqw; wide enough for longer status pills
        dimmed && "opacity-30",
        isClickable && "cursor-pointer hover:opacity-80 transition-opacity",
        className,
      )}
    >
      <WorkerAvatar {...avatarProps} />
      <span className="text-xs leading-tight text-foreground/70 truncate w-full text-center font-medium">
        {name}
      </span>
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
