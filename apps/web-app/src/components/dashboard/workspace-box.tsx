"use client"

import React from "react"
import { Ghost } from "lucide-react"
import { cn } from "@/lib/utils"
import { PersonNode, type PersonNodeProps } from "./person-node"

export interface WorkspaceBoxProps {
  title: string
  icon?: string
  count?: number
  type: "fixed" | "dynamic"
  people: PersonNodeProps[]
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
  icon,
  count,
  type,
  people,
  className,
}: WorkspaceBoxProps) {
  const isEmpty = people.length === 0

  // Don't render dynamic boxes with no people
  if (type === "dynamic" && isEmpty) return null

  const spanClasses = getSpanClasses(people.length)
  const isVertical = people.length <= 3

  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border p-3 flex flex-col gap-2",
        spanClasses,
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-sm">{icon}</span>}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {typeof count === "number" && (
          <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {count}
          </span>
        )}
      </div>

      {/* People area */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-4">
          <Ghost className="h-5 w-5 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/60">All quiet today</span>
        </div>
      ) : (
        <div
          className={cn(
            "flex gap-2 items-center justify-center",
            isVertical ? "flex-col" : "flex-row flex-wrap",
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
