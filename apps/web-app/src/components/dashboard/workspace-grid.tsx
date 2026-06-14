"use client"

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { WorkspaceBox, type WorkspaceBoxProps } from "./workspace-box"

export interface WorkspaceGridProps {
  boxes: WorkspaceBoxProps[]
  className?: string
}

type BoxLayout = { cols: number; rows: number; forceVertical: boolean }

/** Get natural col span for a box */
function getNaturalCols(vis: number): number {
  if (vis <= 1) return 1
  if (vis <= 3) return 2
  return 3
}

/** Get row span */
function getRowSpan(vis: number, cols: number): number {
  if (cols === 1 && vis >= 2) return vis
  if (vis <= 4) return 1
  return Math.ceil(vis / 4)
}

/**
 * Compute layout: keep natural box sizes, but allow 2-3 worker boxes
 * to go vertical (1 col) if it helps fill the row. Gaps stay at the end.
 */
function computeLayout(boxes: WorkspaceBoxProps[]): Map<string, BoxLayout> {
  const result = new Map<string, BoxLayout>()

  const boxInfos = boxes
    .map(b => {
      const vis = b.people.length + (b.onRoadPeople?.length || 0) + (b.remotePeople?.length || 0)
      return { title: b.title, vis, type: b.type }
    })
    .filter(b => !(b.type === "dynamic" && b.vis === 0))

  // First pass: assign natural cols
  const assignments = boxInfos.map(b => ({
    ...b,
    cols: getNaturalCols(b.vis),
    forceVertical: false,
  }))

  // Pack into rows — try to fit 6 cols per row
  // If a 2-3 worker box doesn't fit, try shrinking it to 1 col (vertical)
  let currentRowCols = 0

  for (const box of assignments) {
    if (currentRowCols + box.cols > 6) {
      // Doesn't fit — can we shrink this box to 1 col?
      if (box.vis >= 2 && box.vis <= 3 && currentRowCols + 1 <= 6) {
        box.cols = 1
        box.forceVertical = true
        currentRowCols += 1
      } else {
        // Start new row
        currentRowCols = box.cols
      }
    } else {
      currentRowCols += box.cols
    }
  }

  for (const box of assignments) {
    const rows = getRowSpan(box.vis, box.cols)
    result.set(box.title, { cols: box.cols, rows, forceVertical: box.forceVertical })
  }

  return result
}

function getVisibleCount(box: WorkspaceBoxProps): number {
  return box.people.length + (box.onRoadPeople?.length || 0) + (box.remotePeople?.length || 0)
}

export const WorkspaceGrid = React.memo(function WorkspaceGrid({
  boxes,
  className,
}: WorkspaceGridProps) {
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null)
  const [visualExpanded, setVisualExpanded] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRefs = useRef<(HTMLDivElement | null)[]>([])
  const gridRef = useRef<HTMLDivElement>(null)

  const handleBoxClick = useCallback((title: string) => {
    setExpandedTitle(prev => prev === title ? null : title)
  }, [])

  useEffect(() => {
    if (closingTimer.current) clearTimeout(closingTimer.current)

    if (expandedTitle) {
      setVisualExpanded(expandedTitle)
    } else {
      setVisualExpanded(null)
    }

    return () => {
      if (closingTimer.current) clearTimeout(closingTimer.current)
    }
  }, [expandedTitle])

  const sortedBoxes = useMemo(() => {
    return [...boxes].sort((a, b) => {
      const areaA = getArea(a.people.length)
      const areaB = getArea(b.people.length)
      return areaB - areaA
    })
  }, [boxes])

  const filteredBoxes = sortedBoxes

  const layoutMap = useMemo(() => computeLayout(filteredBoxes), [filteredBoxes])

  const isAnyExpanded = visualExpanded !== null

  // Keyboard navigation
  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    const total = filteredBoxes.length
    if (total === 0) return

    let newIndex = focusedIndex

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault()
        newIndex = focusedIndex < total - 1 ? focusedIndex + 1 : 0
        break
      case "ArrowLeft":
        e.preventDefault()
        newIndex = focusedIndex > 0 ? focusedIndex - 1 : total - 1
        break
      case "ArrowDown":
        e.preventDefault()
        // Move down roughly one row (assume ~3 boxes per row as approximation)
        newIndex = Math.min(focusedIndex + 3, total - 1)
        break
      case "ArrowUp":
        e.preventDefault()
        newIndex = Math.max(focusedIndex - 3, 0)
        break
      default:
        return
    }

    setFocusedIndex(newIndex)
    boxRefs.current[newIndex]?.focus()
  }, [focusedIndex, filteredBoxes.length])

  const handleBoxKeyDown = useCallback((e: React.KeyboardEvent, title: string, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleBoxClick(title)
    } else if (e.key === "Escape") {
      e.preventDefault()
      if (expandedTitle) {
        setExpandedTitle(null)
      }
    }
  }, [handleBoxClick, expandedTitle])

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-6 [grid-auto-flow:dense]"
        style={{
          containerType: "inline-size",
          gap: isAnyExpanded ? "4px" : "0.6cqw",
          gridTemplateRows: isAnyExpanded ? "auto 1fr" : undefined,
          gridAutoRows: isAnyExpanded ? undefined : "minmax(120px, auto)",
          minHeight: isAnyExpanded ? "calc(100vh - 14rem)" : undefined,
          transition: "gap 0.7s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onKeyDown={handleGridKeyDown}
      >
        {filteredBoxes.map((box, i) => {
          const isThis = box.title === visualExpanded
          const layout = layoutMap.get(box.title)

          return (
            <WorkspaceBox
              key={`${box.title}-${box.type}-${i}`}
              ref={(el) => { boxRefs.current[i] = el }}
              {...box}
              isExpanded={isThis}
              isOtherExpanded={isAnyExpanded && !isThis}
              isClosing={isThis && expandedTitle === null}
              totalBoxes={filteredBoxes.length}
              layoutCols={layout?.cols}
              layoutRows={layout?.rows}
              forceVertical={layout?.forceVertical || false}
              onBoxClick={(title) => { setFocusedIndex(i); handleBoxClick(title) }}
              onKeyDown={(e) => handleBoxKeyDown(e, box.title, i)}
            />
          )
        })}
      </div>

    </div>
  )
})

function getArea(count: number): number {
  if (count <= 3) return count
  if (count <= 5) return 3
  return 8
}
