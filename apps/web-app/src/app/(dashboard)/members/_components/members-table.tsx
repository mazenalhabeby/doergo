"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, RefreshCw, UserPlus, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import type { OrgMember } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { MemberRow, TABLE_GRID } from "./member-row"
import { MembersListSkeleton } from "./members-list-skeleton"

/** The member list card: loading, error, the table with its pagination, or the empty state. */
export function MembersTable({
  members, meta, isLoading, isError, isFetching, refetch, isAdmin, userId, isOwner,
  selectedIds, memberSpacesMap, onSelectMember, onSelectAll, onEdit, onRemove, onTransfer, onNavigate,
  setPage, billingLocked, billingLockReason, onInvite,
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
        <div className="bg-card rounded-xl border border-border/80 overflow-hidden">
          {isLoading ? (
            <MembersListSkeleton />
          ) : isError ? (
            /* Error state (audit M-F1). Without this branch a failed request fell
               through to the empty state, so an admin of a 50-person org was told
               "No members yet — invite your first member". */
            <div className="text-center py-20 px-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.error.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                {t("members.error.description")}
              </p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="rounded-lg">
                <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                {t("members.error.retry")}
              </Button>
            </div>
          ) : members.length > 0 ? (
            <>
              {/* Table header */}
              <div
                className={cn(
                  TABLE_GRID,
                  ("hidden md:grid py-2.5 text-xs font-medium text-muted-foreground " +
                    "uppercase tracking-wider border-b border-border/60"))}>
                <div>
                  {isAdmin && (
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === members.filter((m) => m.id !== userId).length}
                      onCheckedChange={(checked) => onSelectAll(!!checked)}
                      className="h-4 w-4"
                    />
                  )}
                </div>
                <div /> {/* Avatar spacer */}
                <div>{t("members.table.member")}</div>
                <div>{t("members.table.title")}</div>
                <div>{t("members.table.role")}</div>
                <div>{t("members.table.schedule")}</div>
                <div>{t("members.table.spaces")}</div>
                <div /> {/* Actions spacer */}
              </div>
              <div className="divide-y divide-border/60">
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

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    {t("common.page", { page: meta.page, totalPages: meta.totalPages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-8 rounded-lg text-xs"
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-8 rounded-lg text-xs"
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="text-center py-20 px-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-5">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.empty.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                {t("members.empty.description")}
              </p>
              {isAdmin && (
                <Button disabled={billingLocked}
                title={billingLocked ? billingLockReason : undefined}
                onClick={onInvite} className="rounded-lg">
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t("members.inviteMember")}
                </Button>
              )}
            </div>
          )}
        </div>
  )
}
