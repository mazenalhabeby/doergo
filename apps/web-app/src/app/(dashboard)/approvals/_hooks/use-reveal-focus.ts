"use client"

import { useCallback, type FocusEvent } from "react"
import { useReactFlow } from "@xyflow/react"

/**
 * Keyboard: Tab may land on a control inside a node that is off screen (the nodes themselves take no focus).
 * The focused node is brought into view — and the browser's own scroll of the clipped canvas, which would
 * leave it drawn out of place, is undone. Focus inside a PORTALED popover or Select list bubbles here too (React
 * bubbles through portals) but is not on the canvas: it is left alone, or a long list would jump back to its top.
 */
export function useRevealFocus() {
  const flow = useReactFlow()
  return useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.target as Node)) return
      for (let el = e.target as HTMLElement | null; el && el !== e.currentTarget; el = el.parentElement)
        if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0)
      const id = (e.target as HTMLElement).closest<HTMLElement>(".react-flow__node")?.dataset.id
      const node = id ? flow.getInternalNode(id) : undefined
      if (!node) return
      const { x, y } = node.internals.positionAbsolute
      const w = node.measured.width ?? 0
      const h = node.measured.height ?? 0
      const view = flow.getViewport()
      const box = e.currentTarget.getBoundingClientRect()
      const [left, top] = [x * view.zoom + view.x, y * view.zoom + view.y]
      if (left >= 0 && top >= 0 && left + w * view.zoom <= box.width && top + h * view.zoom <= box.height) return
      void flow.setCenter(x + w / 2, y + h / 2, { zoom: view.zoom, duration: 300 })
    },
    [flow],
  )
}
