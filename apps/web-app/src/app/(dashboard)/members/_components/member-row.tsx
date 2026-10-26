"use client"

import { memo } from "react"
import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import type { OrgMember } from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { RoleBadge, RowActions, ScheduleBadge, SpacesCell } from "./member-row-cells"

// ---------------------------------------------------------------------------
// MemberRow component
// ---------------------------------------------------------------------------

interface MemberRowProps {
  member: OrgMember
  isSelf: boolean
  isAdmin: boolean
  index: number
  spaceNames: string[]
  isSelected: boolean
  anySelected: boolean
  onSelect: (id: string, checked: boolean) => void
  onEdit: (member: OrgMember) => void
  onRemove: (member: OrgMember) => void
  onTransfer: (member: OrgMember) => void
  /** The viewer owns this organization — the only person who may hand it over. */
  canTransferOwnership: boolean
  onNavigate: (id: string) => void
}

// Shared grid template \u2014 keeps the header and desktop rows perfectly aligned.
export const TABLE_GRID =
  "grid grid-cols-[20px_minmax(0,2.3fr)_minmax(0,1.5fr)_130px_96px_minmax(0,1.6fr)_32px] items-center gap-4 px-3.5"

export const MemberRow = memo(function MemberRow({
  member,
  isSelf,
  isAdmin,
  index,
  spaceNames,
  isSelected,
  anySelected,
  onSelect,
  onEdit,
  onRemove,
  onTransfer,
  canTransferOwnership,
  onNavigate,
}: MemberRowProps) {
  const { t } = useTranslation()
  const canManage = isAdmin && !isSelf
  const hasSchedule = member.scheduleType === "FIXED" || member.scheduleType === "FLEXIBLE"

  const nameButton = (
    <button
      type="button"
      className="truncate text-left text-[14.5px] font-semibold text-foreground hover:underline"
      onClick={() => onNavigate(member.id)}
    >
      {personName(member)}
    </button>
  )

  return (
    <div
      className={cn("group rounded-[14px] transition-colors hover:bg-accent", isSelected && "bg-shell-nav-on")}
      style={{ animation: `fadeSlideIn 0.25s ease-out ${index * 40}ms both` }}
    >
      {/* \u2500\u2500 Desktop: aligned table row \u2500\u2500 */}
      <div className={cn(TABLE_GRID, "hidden min-h-[60px] py-2 md:grid")}>
        <div
          className={cn(
            "transition-opacity",
            anySelected || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {canManage ? (
            <Checkbox checked={isSelected} onCheckedChange={(c) => onSelect(member.id, !!c)} className="h-4 w-4" />
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar
            soft
            firstName={member.firstName}
            lastName={member.lastName}
            avatarUrl={member.avatarUrl}
            seed={member.id}
            size="lg"
          />
          <div className="min-w-0 leading-[1.3]">
            <div className="flex items-center gap-2">
              {nameButton}
              {isSelf && <span className="text-[11px] font-medium text-muted-foreground/70">{t("members.you")}</span>}
            </div>
            <p className="truncate text-[12.5px] text-muted-foreground">{member.email}</p>
          </div>
        </div>
        <span
          className={cn("truncate text-[13.5px]", member.position ? "text-foreground" : "text-muted-foreground/40")}
        >
          {member.position || "\u2014"}
        </span>
        <div>
          <RoleBadge member={member} />
        </div>
        <div>
          <ScheduleBadge member={member} />
        </div>
        <div className="min-w-0">
          <SpacesCell spaceNames={spaceNames} />
        </div>
        <RowActions
          show={isAdmin}
          isSelf={isSelf}
          member={member}
          onEdit={onEdit}
          onRemove={onRemove}
          onTransfer={onTransfer}
          canTransferOwnership={canTransferOwnership}
        />
      </div>

      {/* \u2500\u2500 Mobile: stacked card \u2500\u2500 */}
      <div className="flex items-start gap-3 px-3 py-3 md:hidden">
        {canManage && (
          <Checkbox checked={isSelected} onCheckedChange={(c) => onSelect(member.id, !!c)} className="h-4 w-4 mt-1" />
        )}
        <UserAvatar
          soft
          firstName={member.firstName}
          lastName={member.lastName}
          avatarUrl={member.avatarUrl}
          seed={member.id}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {nameButton}
            {isSelf && <span className="text-[11px] font-medium text-muted-foreground/70">{t("members.you")}</span>}
          </div>
          <p className="truncate text-[12.5px] text-muted-foreground">{member.email}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
            <RoleBadge member={member} />
            {member.position && <span className="text-xs text-muted-foreground">{member.position}</span>}
            {hasSchedule && <ScheduleBadge member={member} />}
            {spaceNames.length > 0 && <SpacesCell spaceNames={spaceNames} />}
          </div>
        </div>
        <RowActions
          show={isAdmin}
          isSelf={isSelf}
          member={member}
          onEdit={onEdit}
          onRemove={onRemove}
          onTransfer={onTransfer}
          canTransferOwnership={canTransferOwnership}
          alwaysVisible
        />
      </div>
    </div>
  )
})
