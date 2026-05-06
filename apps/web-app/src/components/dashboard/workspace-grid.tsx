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
  // Sort: biggest boxes first for better dense packing
  const sortedBoxes = useMemo(() => {
    return [...boxes].sort((a, b) => {
      const areaA = getArea(a.people.length)
      const areaB = getArea(b.people.length)
      return areaB - areaA
    })
  }, [boxes])

  return (
    <div
      className={cn(
        "grid grid-cols-6",
        "[grid-auto-flow:dense]",
        className,
      )}
      style={{ containerType: "inline-size", gap: "0.6cqw", gridAutoRows: "minmax(120px, auto)" }}
    >
      {sortedBoxes.map((box, i) => (
        <WorkspaceBox key={`${box.title}-${box.type}-${i}`} {...box} />
      ))}
    </div>
  )
})

function getArea(count: number): number {
  if (count <= 3) return count // vertical: 1 col × N rows
  if (count <= 5) return 3     // horizontal: 3 cols × 1 row
  return 8                     // 4 cols × 2 rows
}
