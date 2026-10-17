"use client"

import React from "react"
import { type PersonNodeProps } from "./person-node"

/** A workspace card's props and its size on the dashboard grid — moved here unchanged. */
export interface WorkspaceBoxProps {
  title: string
  type: "fixed" | "dynamic"
  people: PersonNodeProps[]
  offDutyPeople?: PersonNodeProps[]
  offShiftPeople?: PersonNodeProps[]
  onRoadPeople?: PersonNodeProps[]
  remotePeople?: PersonNodeProps[]
  activeCount?: number
  totalAssigned?: number
  locationId?: string
  alerts?: number
  onEdit?: (locationId: string) => void
  onAssign?: (locationId: string) => void
  onViewTasks?: (locationId: string) => void
  onPersonClick?: (userId: string) => void
  /** Show absence reasons in the Off-Duty list — admins & managers only. */
  canSeeAbsenceReason?: boolean
  isExpanded?: boolean
  isOtherExpanded?: boolean
  isClosing?: boolean
  totalBoxes?: number
  layoutCols?: number
  layoutRows?: number
  forceVertical?: boolean
  onBoxClick?: (title: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  className?: string
}

/**
 * The only card geometry TypeScript still decides.
 *
 * Widths are not computed here: the card is `max-content` over a grid of real
 * node columns (`.ws-card` / `.ws-card-nodes` in globals.css), so the browser
 * measures what it holds. A JS formula used to predict that width from an
 * assumed 76px column while the node was 84px, which made every card of two or
 * more people wrap a column early — see the note in globals.css.
 *
 * Exported so the loading skeleton lays out on the same rules and the content
 * does not jump when the data lands.
 */
export const WORKSPACE_CARD = {
  /** Most node columns a card will grow to before it wraps. */
  MAX_COLS: 4,
  MIN_H: 135,
  /** Gap between cards in the grid. */
  GRID_GAP: 14,
} as const

/**
 * Node columns for a head-count: at least one (so an empty card matches a
 * one-person card), never more than MAX_COLS. Drives `--ws-cols`.
 */
export function workspaceCardCols(nodeCount: number): number {
  return Math.min(Math.max(nodeCount, 1), WORKSPACE_CARD.MAX_COLS)
}

/**
 * Members previewed on a COLLAPSED card, in display order: clocked in (on-site,
 * in field, remote) first, then online-but-off-shift. Offline off-duty members
 * are deliberately excluded — they only appear inside the expanded card.
 *
 * Exported because the grid sorts on it: a card with nobody here renders the
 * "All quiet today" ghost, and those sink below the spaces that have someone.
 * Keeping it in one place stops the two from drifting apart.
 */
export function previewMembers(
  box: Pick<WorkspaceBoxProps, "people" | "onRoadPeople" | "remotePeople" | "offShiftPeople">,
): PersonNodeProps[] {
  return [...box.people, ...(box.onRoadPeople ?? []), ...(box.remotePeople ?? []), ...(box.offShiftPeople ?? [])]
}
