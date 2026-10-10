"use client"

import { useState, useCallback, useRef } from "react"

import type { Task } from "@/lib/api"

/**
 * Bulk selection: a set of task ids, shift-click ranges over the tasks the
 * page is currently showing, select-all and clear.
 *
 * The page writes the rows it shows into `filteredTasksRef` on every render, so
 * a range is taken over what is on screen, not over what was there when the
 * callbacks were made.
 */
export function useTaskSelection() {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const lastSelectedIndexRef = useRef<number | null>(null)
  const filteredTasksRef = useRef<Task[]>([])

  const handleClearSelection = useCallback(() => {
    setSelectedTaskIds(new Set())
    lastSelectedIndexRef.current = null
  }, [])

  const handleToggleSelect = useCallback((taskId: string, shiftKey: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      const currentTasks = filteredTasksRef.current

      if (shiftKey && lastSelectedIndexRef.current !== null) {
        const currentIndex = currentTasks.findIndex((t: Task) => t.id === taskId)
        if (currentIndex >= 0) {
          const start = Math.min(lastSelectedIndexRef.current, currentIndex)
          const end = Math.max(lastSelectedIndexRef.current, currentIndex)
          for (let i = start; i <= end; i++) {
            const t = currentTasks[i]
            if (t) next.add(t.id)
          }
        }
      } else {
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          next.add(taskId)
        }
      }

      const idx = currentTasks.findIndex((t: Task) => t.id === taskId)
      if (idx >= 0) lastSelectedIndexRef.current = idx

      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedTaskIds(prev => {
      if (prev.size === filteredTasksRef.current.length) {
        return new Set()
      }
      return new Set(filteredTasksRef.current.map((t: Task) => t.id))
    })
  }, [])

  return { selectedTaskIds, filteredTasksRef, handleClearSelection, handleToggleSelect, handleSelectAll }
}
