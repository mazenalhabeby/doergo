"use client"

import { useEffect, useRef, useCallback } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyboardShortcutHandlers {
  /** Create new task (C) */
  onCreateTask?: () => void
  /** Focus search input (/) */
  onSearch?: () => void
  /** Switch view mode (1=Board, 2=List, 3=Schedule) */
  onViewChange?: (view: string) => void
  /** Clear selection / close dialogs (Escape) */
  onClearSelection?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}

const VIEW_MAP: Record<string, string> = {
  "1": "board",
  "2": "table",
  "3": "schedule",
}

// ---------------------------------------------------------------------------
// Sequence tracking for "G then X" shortcuts
// ---------------------------------------------------------------------------

let pendingG = false
let pendingGTimer: ReturnType<typeof setTimeout> | null = null

function resetPendingG() {
  pendingG = false
  if (pendingGTimer) {
    clearTimeout(pendingGTimer)
    pendingGTimer = null
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers keyboard shortcuts for the tasks page and global navigation.
 *
 * Global shortcuts (Cmd/Ctrl+K handled by CommandPaletteProvider):
 * - G then D    : go to dashboard
 * - G then T    : go to tasks
 * - G then S    : go to spaces
 *
 * Tasks page shortcuts:
 * - C           : create task
 * - /           : focus search
 * - 1-4         : switch view
 * - Escape      : clear selection
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  options?: {
    /** Set to true to enable task-page-specific shortcuts */
    enableTaskShortcuts?: boolean
    /** Router push function for G-then-X navigation */
    navigate?: (path: string) => void
  },
) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const optionsRef = useRef(options)
  optionsRef.current = options

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const h = handlersRef.current
    const opts = optionsRef.current

    // Cmd/Ctrl+K is handled globally by CommandPaletteProvider.
    // Skip single-key shortcuts when the user has modifiers pressed for
    // browser/OS shortcuts (except the G-sequence which is plain keys).
    if ((e.metaKey || e.ctrlKey) && e.key === "k") return

    // Don't trigger single-key shortcuts when typing in inputs
    if (isInputElement(e.target)) return

    // --- "G then X" sequence ---
    if (pendingG) {
      resetPendingG()
      const navigate = opts?.navigate
      if (!navigate) return

      switch (e.key.toLowerCase()) {
        case "d":
          e.preventDefault()
          navigate("/dashboard")
          return
        case "t":
          e.preventDefault()
          navigate("/tasks")
          return
        case "s":
          e.preventDefault()
          navigate("/locations")
          return
      }
      return
    }

    // Start "G" sequence
    if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      pendingG = true
      pendingGTimer = setTimeout(resetPendingG, 800)
      return
    }

    // --- Task-page shortcuts ---
    if (opts?.enableTaskShortcuts) {
      // C → create task
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        h.onCreateTask?.()
        return
      }

      // / → focus search
      if (e.key === "/") {
        e.preventDefault()
        h.onSearch?.()
        return
      }

      // 1-4 → switch view
      if (VIEW_MAP[e.key] && !e.metaKey && !e.ctrlKey) {
        h.onViewChange?.(VIEW_MAP[e.key]!)
        return
      }

      // Escape → clear selection
      if (e.key === "Escape") {
        h.onClearSelection?.()
        return
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      resetPendingG()
    }
  }, [handleKeyDown])
}
