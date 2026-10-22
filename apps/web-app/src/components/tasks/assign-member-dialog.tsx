"use client"

import React from "react"
import { Search, Loader2 } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useAssignMemberDialog, type AssignMemberDialogProps } from "./use-assign-member-dialog"
import { MemberRow } from "./assign-member-dialog-helpers"
import { EmptyNote } from "@/components/ui/empty-note"

// =============================================================================
// MOCK DATA
// =============================================================================

// =============================================================================
// MEMBER ROW
// =============================================================================

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
  notice,
}: AssignMemberDialogProps) {
  const {
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
  } = useAssignMemberDialog({
    open,
    onOpenChange,
    taskId,
    spaceId,
    currentAssigneeId,
    currentAssigneeIds,
    onSave,
    onAssign,
    onRemove,
    isAssigning,
    notice,
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden">
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

        {notice}

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
            <EmptyNote>{t("assignMembers.noMembersFound")}</EmptyNote>
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
