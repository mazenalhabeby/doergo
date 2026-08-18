"use client"

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { WorkspaceBox, WORKSPACE_CARD, previewMembers, type WorkspaceBoxProps } from "./workspace-box"

export interface WorkspaceGridProps {
  boxes: WorkspaceBoxProps[]
  className?: string
  /** When there is exactly one box, open it by default (employee single-space view). */
  autoExpandSingle?: boolean
  /** Show absence reasons (Sick/Unexcused/…) in the Off-Duty list — admins & managers only. */
  canSeeAbsenceReason?: boolean
}

export const WorkspaceGrid = React.memo(function WorkspaceGrid({
  boxes,
  className,
  autoExpandSingle = false,
  canSeeAbsenceReason = false,
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

  const sortedBoxes = useMemo(() => sortWorkspaceBoxes(boxes), [boxes])

  const filteredBoxes = sortedBoxes

  // Single-space view (employees): open the only box by default so its members
  // are visible without a click. The user can still collapse it.
  useEffect(() => {
    const only = filteredBoxes.length === 1 ? filteredBoxes[0] : null
    if (autoExpandSingle && only) {
      setExpandedTitle(only.title)
      return
    }
    // Drop a stale expanded title that no longer matches any current box. Without
    // this, swapping the boxes out (e.g. the guide's example space reverting to the
    // real spaces) leaves the grid "expanded" on a title that no box has — so every
    // real box collapses into a tiny chip and the expanded area renders empty.
    setExpandedTitle((prev) => (prev && !filteredBoxes.some((b) => b.title === prev) ? null : prev))
  }, [autoExpandSingle, filteredBoxes])

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

  const renderBox = (box: WorkspaceBoxProps, i: number) => {
    const isThis = box.title === visualExpanded
    return (
      <WorkspaceBox
        key={`${box.title}-${box.type}-${i}`}
        ref={(el) => { boxRefs.current[i] = el }}
        {...box}
        canSeeAbsenceReason={canSeeAbsenceReason}
        isExpanded={isThis}
        isOtherExpanded={isAnyExpanded && !isThis}
        isClosing={isThis && expandedTitle === null}
        onBoxClick={(title) => { setFocusedIndex(i); handleBoxClick(title) }}
        onKeyDown={(e) => handleBoxKeyDown(e, box.title, i)}
      />
    )
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} onKeyDown={handleGridKeyDown}>
      {isAnyExpanded ? (
        // Open: chip strip on top, then the expanded space filling the rest of the
        // available width AND height.
        <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 13rem)" }}>
          <div className="flex flex-wrap gap-2 shrink-0">
            {filteredBoxes.map((box, i) => (box.title === visualExpanded ? null : renderBox(box, i)))}
          </div>
          <div className="flex-1 min-h-0 flex">
            {filteredBoxes.map((box, i) => (box.title === visualExpanded ? renderBox(box, i) : null))}
          </div>
        </div>
      ) : (
        // Closed: cards sized to their content — an empty / 1-person space is just
        // one node (76×89) + padding; bigger teams grow wider. Packed left, wrap.
        <div ref={gridRef} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: WORKSPACE_CARD.GRID_GAP }}>
          {filteredBoxes.map(renderBox)}
        </div>
      )}
    </div>
  )
})

/** Coarse size bucket, so cards of similar team size group together. */
function getArea(count: number): number {
  if (count <= 3) return count
  if (count <= 5) return 3
  return 8
}

/**
 * Display order for the grid: spaces with someone in them first, quiet ("All
 * quiet today") spaces last, so the eye lands on where work is actually
 * happening instead of hunting for busy cards between empty ones. Within each
 * group the biggest teams lead.
 *
 * Pure and exported so the ordering can be tested without mounting the grid.
 * Does not mutate its input, and Array#sort is stable, so boxes that tie keep
 * their incoming order.
 */
export function sortWorkspaceBoxes(boxes: WorkspaceBoxProps[]): WorkspaceBoxProps[] {
  return [...boxes].sort((a, b) => {
    const quietA = previewMembers(a).length === 0
    const quietB = previewMembers(b).length === 0
    if (quietA !== quietB) return quietA ? 1 : -1
    return getArea(b.people.length) - getArea(a.people.length)
  })
}
