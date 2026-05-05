"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { WorkerAvatar, type WorkerAvatarProps } from "./worker-avatar"

export type TagVariant = "task" | "late" | "miss" | "hrs" | "hrs-warn"

export interface PersonNodeTag {
  text: string
  variant: TagVariant
}

export interface PersonNodeProps extends WorkerAvatarProps {
  name: string
  tag?: PersonNodeTag
  className?: string
}

const TAG_CLASSES: Record<TagVariant, string> = {
  task: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  late: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  miss: "bg-red-500/20 text-red-600 dark:text-red-400",
  hrs: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  "hrs-warn": "bg-amber-500/20 text-amber-600 dark:text-amber-400",
}

export const PersonNode = React.memo(function PersonNode({
  name,
  tag,
  className,
  ...avatarProps
}: PersonNodeProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1 w-[72px]", className)}>
      <WorkerAvatar {...avatarProps} />
      <span className="text-[11px] leading-tight text-muted-foreground truncate w-full text-center">
        {name}
      </span>
      {tag ? (
        <span
          className={cn(
            "text-[10px] font-medium leading-none px-1.5 py-0.5 rounded-full",
            TAG_CLASSES[tag.variant],
          )}
        >
          {tag.text}
        </span>
      ) : (
        <span className="h-[14px]" /> // Placeholder for consistent height
      )}
    </div>
  )
})
