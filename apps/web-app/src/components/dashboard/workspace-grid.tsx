"use client"

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { WorkspaceBox, type WorkspaceBoxProps } from "./workspace-box"

export interface WorkspaceGridProps {
  boxes: WorkspaceBoxProps[]
  className?: string
}

export const WorkspaceGrid = React.memo(function WorkspaceGrid({
  boxes,
  className,
}: WorkspaceGridProps) {
  // Sort boxes by people count descending for better dense packing
  const sortedBoxes = useMemo(() => {
    return [...boxes].sort((a, b) => b.people.length - a.people.length)
  }, [boxes])

  return (
    <div
      className={cn(
        "grid grid-cols-6 auto-rows-auto grid-flow-dense gap-3",
        className,
      )}
    >
      {sortedBoxes.map((box) => (
        <WorkspaceBox key={box.title} {...box} />
      ))}
    </div>
  )
})
