"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { OrgMember } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Icon } from "@/components/ui/icon"
import { Panel } from "@/components/page/page-kit"
import { MemberRow, TABLE_GRID } from "./member-row"
import { MembersListSkeleton } from "./members-list-skeleton"
import { ListPager } from "@/components/ui/list-pager"

/** The member list card: loading, error, the table with its pagination, or the empty state. */
export function MembersTable({
  members,
  meta,
  isLoading,
  isError,
  isFetching,
  refetch,
  isAdmin,
  userId,
  isOwner,
  selectedIds,
  memberSpacesMap,
  onSelectMember,
  onSelectAll,
  onEdit,
  onRemove,
  onTransfer,
  onNavigate,
  setPage,
  billingLocked,
  billingLockReason,
  onInvite,
}: {
  members: OrgMember[]
  meta: { page: number; totalPages: number } | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => unknown
  isAdmin: boolean
  userId: string | undefined
  isOwner: boolean
  selectedIds: Set<string>
  memberSpacesMap: Record<string, string[]>
  onSelectMember: (id: string, checked: boolean) => void
  onSelectAll: (checked: boolean) => void
  onEdit: (member: OrgMember) => void
  onRemove: (member: OrgMember) => void
  onTransfer: (member: OrgMember) => void
  onNavigate: (id: string) => void
  setPage: Dispatch<SetStateAction<number>>
  billingLocked: boolean
  billingLockReason: string | undefined
  onInvite: () => void
}) {
  const { t } = useTranslation()
  return (
    <Panel className="p-1.5">
      {isLoading ? (
        <MembersListSkeleton />
      ) : isError ? (
        /* Error state (audit M-F1). Without this branch a failed request fell
               through to the empty state, so an admin of a 50-person org was told
               "No members yet — invite your first member". */
        <div className="text-center py-20 px-6">
          <div
            className={
              "mx-auto mb-5 grid size-14 place-items-center rounded-full text-shell-crit " +
              "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]"
            }
          >
            <Icon name="alert" size={26} />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.error.title")}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">{t("members.error.description")}</p>
          <Button variant="outline" size="pill" onClick={() => refetch()} disabled={isFetching}>
            <Icon name="refreshLine" className={cn(isFetching && "animate-spin")} />
            {t("members.error.retry")}
          </Button>
        </div>
      ) : members.length > 0 ? (
        <>
          {/* Table header */}
          <div className={cn(TABLE_GRID, "hidden h-10 text-xs font-medium text-muted-foreground md:grid")}>
            <div>
              {isAdmin && (
                <Checkbox
                  checked={selectedIds.size > 0 && selectedIds.size === members.filter((m) => m.id !== userId).length}
                  onCheckedChange={(checked) => onSelectAll(!!checked)}
                  className="h-4 w-4"
                />
              )}
            </div>
            <div>{t("members.table.member")}</div>
            <div>{t("members.table.title")}</div>
            <div>{t("members.table.role")}</div>
            <div>{t("members.table.schedule")}</div>
            <div>{t("members.table.spaces")}</div>
            <div /> {/* Actions spacer */}
          </div>
          <div className="flex flex-col">
            {members.map((member, i) => (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.id === userId}
                isAdmin={isAdmin}
                index={i}
                spaceNames={memberSpacesMap[member.id] || []}
                isSelected={selectedIds.has(member.id)}
                anySelected={selectedIds.size > 0}
                onSelect={onSelectMember}
                onEdit={onEdit}
                onRemove={onRemove}
                onTransfer={onTransfer}
                canTransferOwnership={isOwner}
                onNavigate={onNavigate}
              />
            ))}
          </div>

          {meta && <ListPager page={meta.page} totalPages={meta.totalPages} setPage={setPage} />}
        </>
      ) : (
        /* Empty state */
        <div className="text-center py-20 px-6">
          <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-shell-chip text-muted-foreground">
            <Icon name="people" size={26} />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.empty.title")}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">{t("members.empty.description")}</p>
          {isAdmin && (
            <Button
              disabled={billingLocked}
              title={billingLocked ? billingLockReason : undefined}
              onClick={onInvite}
              size="pillLg"
            >
              <Icon name="addUser" />
              {t("members.inviteMember")}
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}
