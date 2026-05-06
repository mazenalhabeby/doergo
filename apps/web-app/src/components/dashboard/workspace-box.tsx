"use client"

import React from "react"
import { Ghost, Settings2, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { PersonNode, type PersonNodeProps } from "./person-node"

export interface WorkspaceBoxProps {
  title: string
  type: "fixed" | "dynamic"
  people: PersonNodeProps[]
  totalAssigned?: number
  locationId?: string
  onEdit?: (locationId: string) => void
  onAssign?: (locationId: string) => void
  className?: string
}

function getSpanClasses(count: number): string {
  if (count <= 1) return "col-span-1 row-span-1"
  if (count === 2) return "col-span-1 row-span-2"
  if (count === 3) return "col-span-1 row-span-3"
  if (count <= 5) return "col-span-3 row-span-1"
  return "col-span-4 row-span-2"
}

export const WorkspaceBox = React.memo(function WorkspaceBox({
  title,
  type,
  people,
  totalAssigned,
  locationId,
  onEdit,
  onAssign,
  className,
}: WorkspaceBoxProps) {
  const isEmpty = people.length === 0

  if (type === "dynamic" && isEmpty) return null

  const spanClasses = getSpanClasses(people.length)
  const isVertical = people.length >= 1 && people.length <= 3
  const isHorizontal = people.length >= 4
  const isFixed = type === "fixed"

  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border",
        "flex flex-col transition-colors duration-200",
        "hover:bg-accent/30 group/box relative",
        spanClasses,
        isEmpty && "border-dashed opacity-50 hover:opacity-70 dark:hover:opacity-60 transition-opacity",
        className,
      )}
      style={{ minHeight: 120 }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/80 truncate min-w-0">
          {title}
        </span>
        {totalAssigned != null && totalAssigned > 0 && (
          <span className="ml-auto text-[10px] font-bold text-foreground/80 tabular-nums tracking-wider">
            {people.length}/{totalAssigned}
          </span>
        )}

        {/* Hover actions — only for fixed locations */}
        {isFixed && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/box:opacity-100 transition-all duration-200 translate-y-0.5 group-hover/box:translate-y-0">
            {onAssign && locationId && (
              <button
                onClick={(e) => { e.stopPropagation(); onAssign(locationId) }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Assign workers"
              >
                <UserPlus className="h-3 w-3" />
              </button>
            )}
            {onEdit && locationId && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(locationId) }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Edit location"
              >
                <Settings2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* People area */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-[1cqw]">
          <Ghost className="h-8 w-8 text-foreground/80" />
          <span className="text-xs text-foreground/80 font-medium">
            All quiet today
          </span>
          {/* Quick assign button for empty locations */}
          {isFixed && onAssign && locationId && (
            <button
              onClick={() => onAssign(locationId)}
              className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <UserPlus className="h-3 w-3" />
              Assign workers
            </button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center content-center flex-1",
            "gap-[1cqw] p-[1cqw]",
            isVertical && "flex-col",
            isHorizontal && "flex-row",
          )}
        >
          {people.map((person, i) => (
            <PersonNode key={`${person.name}-${i}`} {...person} />
          ))}
        </div>
      )}
    </div>
  )
})
