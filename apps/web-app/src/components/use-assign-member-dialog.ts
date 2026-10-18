"use client"

import { personName } from "@hbcfield/shared/client"
import React, { useState, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { AssignablePerson } from "@/lib/assignable-members"
import { useAssignableMembers } from "@/hooks/use-assignable-members"

// =============================================================================
// TYPES
// =============================================================================

export interface AssignMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string | null
  spaceId?: string | null
  currentAssigneeId?: string | null
  /** Current assignee IDs — for multi-select mode */
  currentAssigneeIds?: string[]
  /** Called with the final selected member IDs when Save is clicked */
  onSave?: (added: string[], removed: string[]) => void
  /** Legacy single-assign callback */
  onAssign: (memberId: string) => void
  onRemove?: (memberId: string) => void
  isAssigning?: boolean
  /** Shown under the title — something the caller needs said before a pick (e.g. a handover still owed). */
  notice?: React.ReactNode
}

/** AssignMemberDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useAssignMemberDialog({
  open,
  onOpenChange,
  taskId,
  spaceId,
  currentAssigneeId,
  currentAssigneeIds = [],
  onSave,
  onAssign,
  onRemove,
  isAssigning = false,
  notice,
}: Pick<AssignMemberDialogProps,
  | 'open'
  | 'onOpenChange'
  | 'taskId'
  | 'spaceId'
  | 'currentAssigneeId'
  | 'currentAssigneeIds'
  | 'onSave'
  | 'onAssign'
  | 'onRemove'
  | 'isAssigning'
  | 'notice'
>) {
  const { t } = useTranslation()
  const isMultiMode = !!onSave || !!onRemove
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const prevOpenRef = React.useRef(false)

  // Only sync selection when dialog OPENS (not on every render)
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      const initial = new Set(currentAssigneeIds)
      if (currentAssigneeId) initial.add(currentAssigneeId)
      setSelectedIds(initial)
    }
    prevOpenRef.current = open
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute what changed
  const originalIds = useMemo(() => {
    const ids = new Set(currentAssigneeIds)
    if (currentAssigneeId) ids.add(currentAssigneeId)
    return ids
  }, [currentAssigneeId, currentAssigneeIds])

  const hasChanges = useMemo(() => {
    if (selectedIds.size !== originalIds.size) return true
    for (const id of selectedIds) { if (!originalIds.has(id)) return true }
    for (const id of originalIds) { if (!selectedIds.has(id)) return true }
    return false
  }, [selectedIds, originalIds])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) { setSearch(""); setSelectedIds(new Set()) }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  /*
    Who can be picked — the organization directory for whoever may read it, the
    workspace's roster otherwise (see lib/assignable-members.ts). Reading the
    directory unconditionally 403'd for every manager without canManageUsers and
    the dialog listed nobody.
  */
  const { members: allMembers, spaceMemberIds, isLoading } = useAssignableMembers({
    spaceId,
    enabled: open,
  })

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return allMembers
    const q = search.toLowerCase()
    return allMembers.filter((m) => {
      const fullName = personName(m).toLowerCase()
      return fullName.includes(q) || (m.email && m.email.toLowerCase().includes(q))
    })
  }, [allMembers, search])

  // Split into space members and others
  const { spaceMembers, otherMembers } = useMemo(() => {
    if (!spaceId || spaceMemberIds.size === 0) {
      return { spaceMembers: [], otherMembers: filtered }
    }
    const space: AssignablePerson[] = []
    const other: AssignablePerson[] = []
    for (const m of filtered) {
      if (spaceMemberIds.has(m.id)) {
        space.push(m)
      } else {
        other.push(m)
      }
    }
    return { spaceMembers: space, otherMembers: other }
  }, [filtered, spaceId, spaceMemberIds])

  const handleToggle = useCallback((memberId: string) => {
    if (isMultiMode) {
      // Toggle in local state — no server call yet
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(memberId)) next.delete(memberId)
        else next.add(memberId)
        return next
      })
    } else {
      // Single mode — assign immediately
      onAssign(memberId)
    }
  }, [isMultiMode, onAssign])

  const handleSave = useCallback(async () => {
    const added = [...selectedIds].filter(id => !originalIds.has(id))
    const removed = [...originalIds].filter(id => !selectedIds.has(id))
    if (added.length === 0 && removed.length === 0) { handleOpenChange(false); return }

    setSaving(true)
    try {
      if (onSave) {
        await onSave(added, removed)
      } else {
        // Fallback: call onAssign/onRemove individually
        for (const id of added) onAssign(id)
        for (const id of removed) onRemove?.(id)
      }
      handleOpenChange(false)
    } finally {
      setSaving(false)
    }
  }, [selectedIds, originalIds, onSave, onAssign, onRemove, handleOpenChange])

  // Find space name for section header
  const spaceName = useMemo(() => {
    if (!spaceId) return null
    // We don't have direct access to space name here, so use a generic label
    // The caller can enhance this if needed
    return "Space"
  }, [spaceId])

  return {
    t,
    isMultiMode,
    search,
    setSearch,
    selectedIds,
    saving,
    hasChanges,
    handleOpenChange,
    isLoading,
    filtered,
    spaceMembers,
    otherMembers,
    handleToggle,
    handleSave,
  }
}
