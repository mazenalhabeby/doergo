"use client"

import { useEffect } from "react"
import { listOrder } from "../_lib/list-order"
import type { ApprovalDay, ApprovalItem } from "@hbcfield/shared/client"
import { itemKey } from "../_lib/approval-keys"

/** Where an item opened from a day ("Review") came from: Back returns to that day. */
export type ReturnTo = { day: string; item: string }

/** The row drawn for `key` — focused on the next frame, once the list has been drawn with it chosen. */
export const focusRow = (key: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-approval-key="${CSS.escape(key)}"]`)?.focus())

/**
 * ↑ / ↓ walk the list — a queue is worked through, not clicked through. Only on "To decide", and only while the
 * focus is on nothing (the page itself) or on a row of the list: a button in the panel (Approve, Back, "Make a
 * rule"), a field, a select or a radio group keeps its keys, or the panel would re-draw under it and the focus
 * fall to the page. An item opened from a day walks that day's items; one opened some other way, outside the
 * list, does not walk at all.
 */
export function useArrowWalk(opts: {
  enabled: boolean
  days: ApprovalDay[]
  allDays: ApprovalDay[]
  visible: ApprovalItem[]
  selected: string | null
  returnTo: ReturnTo | null
  membersOf: (day: ApprovalDay) => ApprovalItem[]
  select: (key: string) => void
  setReturnTo: (r: ReturnTo) => void
}) {
  const { enabled, days, allDays, visible, selected, returnTo, membersOf, select, setReturnTo } = opts
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const el = document.activeElement as HTMLElement | null
      const onRow = !!el?.closest("[data-approval-key]")
      if (el && el !== document.body && !onRow) return
      const step = e.key === "ArrowDown" ? 1 : -1
      // The list as drawn — each group's days, then its items — so a day is walked through, never skipped.
      const order = listOrder(days, visible)
      const at = order.indexOf(selected ?? "")
      let next: string | undefined
      if (at >= 0) next = order[Math.min(order.length - 1, Math.max(0, at + step))]
      else if (returnTo && selected === returnTo.item) {
        // Opened from a day: its items, in the day's order.
        const day = allDays.find((d) => d.key === returnTo.day)
        const members = day ? membersOf(day).map(itemKey) : []
        const i = members.indexOf(selected)
        next = i < 0 ? undefined : members[Math.min(members.length - 1, Math.max(0, i + step))]
        if (next) setReturnTo({ day: returnTo.day, item: next })
      }
      if (!next) return
      e.preventDefault()
      if (next === selected) return
      select(next)
      // Roving focus: a keyboard on the list stays on it, on the row now chosen.
      focusRow(next)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled, days, allDays, visible, selected, returnTo, membersOf, select, setReturnTo])
}
