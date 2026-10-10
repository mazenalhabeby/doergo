"use client"

import { useEffect, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { Search, ClipboardList, Plus, Archive } from "lucide-react"

import { useCommandPalette, type CommandAction } from "@/contexts/command-palette-context"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import type { ViewMode } from "../_lib/task-list"

/** The task page's keyboard shortcuts and its entries in the command palette. */
export function useTaskCommands({
  canCreateTasks,
  spaces,
  searchInputRef,
  openCreateDialog,
  openNewSprint,
  showBacklog,
  handleViewModeChange,
  handleClearSelection,
  handleSpaceChange,
}: {
  canCreateTasks: boolean
  spaces: { id: string; name: string }[]
  searchInputRef: RefObject<HTMLInputElement | null>
  openCreateDialog: () => void
  openNewSprint: () => void
  showBacklog: () => void
  handleViewModeChange: (mode: ViewMode) => void
  handleClearSelection: () => void
  handleSpaceChange: (spaceId: string | null) => void
}) {
  const router = useRouter()
  const { registerActions, unregisterActions } = useCommandPalette()

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts(
    {
      onCreateTask: canCreateTasks ? () => openCreateDialog() : undefined,
      onSearch: () => searchInputRef.current?.focus(),
      onViewChange: (view) => handleViewModeChange(view as ViewMode),
      onClearSelection: handleClearSelection,
    },
    { enableTaskShortcuts: true, navigate: (path) => router.push(path) },
  )

  // ── Register task-specific commands with command palette ────────────────────
  useEffect(() => {
    const taskActions: CommandAction[] = []

    if (canCreateTasks) {
      taskActions.push({
        id: "task-create",
        label: "Create New Task",
        description: "Open the create task dialog",
        icon: Plus,
        group: "tasks",
        shortcut: "C",
        onSelect: () => openCreateDialog(),
        contextual: true,
      })
    }

    taskActions.push({
      id: "task-search",
      label: "Search Tasks",
      description: "Focus the task search input",
      icon: Search,
      group: "tasks",
      shortcut: "/",
      onSelect: () => searchInputRef.current?.focus(),
      contextual: true,
    })

    // Sprint actions
    taskActions.push({
      id: "sprint-create",
      label: "Create Sprint",
      description: "Open the sprint form dialog",
      icon: Plus,
      group: "sprints",
      onSelect: () => openNewSprint(),
      contextual: true,
    })

    taskActions.push({
      id: "sprint-backlog",
      label: "View Backlog",
      description: "Show tasks not assigned to any sprint",
      icon: Archive,
      group: "sprints",
      onSelect: () => showBacklog(),
      contextual: true,
    })

    // Space navigation actions
    for (const space of spaces) {
      taskActions.push({
        id: `space-${space.id}`,
        label: `Go to ${space.name} tasks`,
        description: `Filter tasks by ${space.name} space`,
        icon: ClipboardList,
        group: "tasks",
        onSelect: () => handleSpaceChange(space.id),
        contextual: true,
      })
    }

    const ids = taskActions.map((a) => a.id)
    registerActions(taskActions)
    return () => unregisterActions(ids)
  }, [canCreateTasks, spaces, handleSpaceChange, registerActions, unregisterActions]) // eslint-disable-line react-hooks/exhaustive-deps
}
