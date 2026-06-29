"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Search, Check, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { organizationsApi, locationsApi, type OrgMember } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"

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
}

// =============================================================================
// MOCK DATA
// =============================================================================


// =============================================================================
// MEMBER ROW
// =============================================================================

const MemberRow = React.memo(function MemberRow({
  member,
  isCurrent,
  isAssigning,
  onAssign,
}: {
  member: OrgMember
  isCurrent: boolean
  isAssigning: boolean
  onAssign: (id: string) => void
}) {
  const title = member.position || member.specialty || member.role

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 ease-out",
        isCurrent
          ? "bg-blue-50/80 dark:bg-blue-500/10"
          : "hover:bg-accent/50",
        isAssigning && "pointer-events-none opacity-60",
      )}
      onClick={() => onAssign(member.id)}
      disabled={isAssigning}
    >
      {/* Avatar */}
      <UserAvatar
        firstName={member.firstName}
        lastName={member.lastName}
        avatarUrl={member.avatarUrl}
        seed={member.id}
        size="md"
      />

      {/* Name + title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {member.firstName} {member.lastName}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{title}</p>
      </div>

      {/* Current assignee indicator */}
      {isCurrent && (
        <div className="flex-shrink-0">
          <Check className="size-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}
    </button>
  )
})

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AssignMemberDialog({
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
}: AssignMemberDialogProps) {
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

  // Fetch all org members
  const { data: membersData, isLoading: loadingMembers } = useQuery({
    queryKey: ["org-members-for-assign"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    enabled: open,
    staleTime: 30000,
  })

  // Fetch space-assigned members (only when spaceId is set)
  const { data: spaceAssignments, isLoading: loadingSpace } = useQuery({
    queryKey: ["space-assignments", spaceId],
    queryFn: () => locationsApi.getAssignedMembers(spaceId!),
    enabled: open && !!spaceId,
    staleTime: 30000,
  })

  const allMembers: OrgMember[] = useMemo(() => {
    return membersData?.data || []
  }, [membersData])

  const spaceMemberIds: Set<string> = useMemo(() => {
    if (!spaceAssignments) return new Set<string>()
    return new Set(spaceAssignments.map((a) => a.userId))
  }, [spaceAssignments])

  const isLoading = loadingMembers || (!!spaceId && loadingSpace)

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return allMembers
    const q = search.toLowerCase()
    return allMembers.filter((m) => {
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase()
      return fullName.includes(q) || (m.email && m.email.toLowerCase().includes(q))
    })
  }, [allMembers, search])

  // Split into space members and others
  const { spaceMembers, otherMembers } = useMemo(() => {
    if (!spaceId || spaceMemberIds.size === 0) {
      return { spaceMembers: [], otherMembers: filtered }
    }
    const space: OrgMember[] = []
    const other: OrgMember[] = []
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold text-foreground">
            {isMultiMode ? t("assignMembers.manageAssignees") : t("assignMembers.assignTo")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isMultiMode
              ? `${t("assignMembers.selected", { count: selectedIds.size })}${hasChanges ? ` — ${t("assignMembers.unsavedChanges")}` : ""}`
              : t("assignMembers.selectDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t("assignMembers.searchPlaceholder")}
              className="pl-9 h-9 text-sm rounded-lg border-border bg-muted/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Member List */}
        <div className="border-t border-border max-h-[380px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("assignMembers.noMembersFound")}</p>
            </div>
          ) : (
            <>
              {/* Space members section */}
              {spaceMembers.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      {t("assignMembers.spaceMembers")}
                    </span>
                  </div>
                  {spaceMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isCurrent={selectedIds.has(member.id)}
                      isAssigning={isAssigning}
                      onAssign={handleToggle}
                    />
                  ))}
                </>
              )}

              {/* Other members section (or all members if no space) */}
              {otherMembers.length > 0 && (
                <>
                  {spaceMembers.length > 0 && (
                    <div className="px-4 pt-4 pb-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        {t("assignMembers.otherMembers")}
                      </span>
                    </div>
                  )}
                  {otherMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isCurrent={selectedIds.has(member.id)}
                      isAssigning={isAssigning}
                      onAssign={handleToggle}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Save button — only in multi mode */}
        {isMultiMode && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("assignMembers.membersSelected", { count: selectedIds.size })}
            </span>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-medium transition-colors",
                hasChanges
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
