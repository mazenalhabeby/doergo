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
    <div
      className={cn(
        "flex flex-col items-center cursor-pointer",
        "gap-2.5 w-[8cqw] min-w-[60px]",
        "transition-transform duration-150 hover:scale-105",
        className,
      )}
    >
      <WorkerAvatar {...avatarProps} />
      <span className="text-[clamp(7px,0.9cqw,12px)] leading-tight text-foreground/70 truncate w-full text-center font-medium">
        {name}
      </span>
      <div className="min-h-[clamp(10px,1.2cqw,16px)] flex items-center">
        {tag ? (
          <span
            className={cn(
              "text-[10px] font-bold leading-none px-2 py-1 rounded-full uppercase tracking-wide",
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
