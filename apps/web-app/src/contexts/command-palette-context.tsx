"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { LucideIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandAction {
  /** Unique identifier */
  id: string
  /** Display label */
  label: string
  /** Optional description shown below the label */
  description?: string
  /** Icon component */
  icon?: LucideIcon
  /** Category for grouping in the palette */
  group: "navigation" | "tasks" | "sprints" | "quick-actions"
  /** Keyboard shortcut hint (display only, e.g. "G then D") */
  shortcut?: string
  /** Action to run when selected */
  onSelect: () => void
  /** If true, only shown when a specific page registers it */
  contextual?: boolean
}

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  actions: CommandAction[]
  registerActions: (actions: CommandAction[]) => void
  unregisterActions: (ids: string[]) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: () => {},
  actions: [],
  registerActions: () => {},
  unregisterActions: () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  // Use a ref + state combo so that registrations from effects don't cause
  // render loops but the palette still re-renders when actions change.
  const actionsRef = useRef<Map<string, CommandAction>>(new Map())
  const [actions, setActions] = useState<CommandAction[]>([])

  const syncActions = useCallback(() => {
    const next = Array.from(actionsRef.current.values())
    setActions(prev => {
      // Only update if the action IDs actually changed to avoid render loops
      if (prev.length === next.length && prev.every((a, i) => a.id === next[i]?.id)) return prev
      return next
    })
  }, [])

  const registerActions = useCallback(
    (newActions: CommandAction[]) => {
      for (const action of newActions) {
        actionsRef.current.set(action.id, action)
      }
      syncActions()
    },
    [syncActions],
  )

  const unregisterActions = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        actionsRef.current.delete(id)
      }
      syncActions()
    },
    [syncActions],
  )

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const value = useMemo(
    () => ({ open, setOpen, actions, registerActions, unregisterActions }),
    [open, actions, registerActions, unregisterActions],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}
