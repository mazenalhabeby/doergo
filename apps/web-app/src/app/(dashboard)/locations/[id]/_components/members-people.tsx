"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Home, Loader2, Search, Trash2, UserPlus, Users } from "lucide-react"

import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { fetchAllPages } from "@/lib/paginate"
import { useAuth } from "@/contexts/auth-context"
import { mayListOrgMembers, type AssignablePerson } from "@/lib/assignable-members"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import {
  locationsApi,
  type LocationAssignment,
  organizationsApi,
  rateHistoryApi,
  spaceMembersApi,
  spaceRolesApi,
  spaceUnitsApi,
  type SpaceUnit,
} from "@/lib/api"
import { personInitials, personName, jobTitleOf, mayGrantSpaceRoles, mayManageSpaceMembers, type SpaceMember, type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DatedRateField } from "@/components/rates/dated-rate"
import { EmptyState } from "./section-header"
import { MemberRoutingEditor } from "./member-routing-editor"
import { MemberAutoClock, useWorkspaceAutoClock } from "./member-auto-clock"
import { MemberPermissions } from "./member-permissions"
import { BILL_BY, roleQueryKey, Segmented, useBillByLabel, useCents, useSpaceCurrency, type BillBy } from "./work-roles"
import { NONE, RoleTag } from "./members-people-helpers"
import { AddMemberDialog } from "./add-member-dialog"
import { MemberPanel } from "./member-panel"

/**
 * The People tab of a workspace's Members page.
 *
 * ⚠️ ONE ROW PER PERSON, ONE PANEL PER PERSON. The row is for reading — trade,
 * management role, billing, the hourly and day rate that actually apply — and
 * everything you can change about somebody opens in the side panel. The old
 * page put chips, a rate chip, Routing, ⋯ and Remove on every row, and grew a
 * little taller with every feature until nobody could scan it.
 *
 * Nothing here decides anything new: every change goes through the same
 * endpoints and the same shared rules as before.
 */

export function PeopleSection({ spaceId, hasApartments }: { spaceId: string; hasApartments?: boolean }) {
  const { t } = useTranslation()
  const cents = useCents(useSpaceCurrency(spaceId).bill)
  const billByLabel = useBillByLabel()
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [billFilter, setBillFilter] = useState<string>("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const { data: members, isLoading } = useQuery({
    queryKey: keys.spaceMembers.list(spaceId),
    queryFn: () => spaceMembersApi.list(spaceId),
  })
  const { data: roles } = useQuery({
    queryKey: roleQueryKey(spaceId),
    queryFn: () => spaceRolesApi.listInSpace(spaceId),
  })
  const { data: space } = useQuery({
    queryKey: keys.locations.detail(spaceId),
    queryFn: () => locationsApi.getById(spaceId),
    staleTime: 60_000,
  })
  const { data: unitData } = useQuery({
    queryKey: keys.spaces.memberUnits(spaceId),
    queryFn: () => spaceUnitsApi.list(spaceId),
    enabled: !!hasApartments,
  })
  const isClient = space?.kind === "CUSTOMER"
  // The automatic clock: per-person switch + consent, read only while the workspace has it on.
  const autoClock = useWorkspaceAutoClock(spaceId, space as (typeof space & { autoClock?: unknown }) | undefined)
  const roleById = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r])), [roles])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (members ?? []).filter((m) => {
      if (q && !`${personName(m.user)} ${m.user?.position ?? ""}`.toLowerCase().includes(q)) return false
      if (roleFilter !== "all" && m.workRole?.id !== roleFilter && m.spaceRole?.id !== roleFilter) return false
      if (billFilter !== "all" && (m.effectiveBillBy ?? "HOUR") !== billFilter) return false
      return true
    })
  }, [members, query, roleFilter, billFilter])
  const open = (members ?? []).find((m) => m.id === openId) ?? null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("scheduling.membersPage.search")}
            className="h-9 pl-9"
            aria-label={t("scheduling.membersPage.search")}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-44" aria-label={t("scheduling.membersPage.roleFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("scheduling.membersPage.allRoles")}</SelectItem>
            {(roles ?? []).filter((r) => r.holders.length > 0).map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isClient && (
          <Select value={billFilter} onValueChange={setBillFilter}>
            <SelectTrigger className="h-9 w-40" aria-label={t("scheduling.membersPage.billingFilter")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("scheduling.membersPage.allBilling")}</SelectItem>
              {BILL_BY.map((b) => <SelectItem key={b} value={b}>{billByLabel(b)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button onClick={() => setAdding(true)} className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          {t("scheduling.membersPage.addMember")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !members || members.length === 0 ? (
        <EmptyState icon={Users} title={t("scheduling.members.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          {/*
            Three columns that fit the page: who, their roles, how they are
            billed. Six narrow ones scrolled sideways and wrapped "set for this
            person" over three lines.
          */}
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t("scheduling.membersPage.colMember")}</th>
                <th className="px-4 py-2.5 font-medium">{t("scheduling.membersPage.colRoles")}</th>
                {isClient && <th className="px-4 py-2.5 text-right font-medium">{t("scheduling.membersPage.colBilling")}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const bill = (m.effectiveBillBy ?? "HOUR") as BillBy
                const external = m.user?.isExternal === true
                const hourly = m.billRateCents ?? m.inheritedBillRateCents ?? null
                const workRole = m.workRole ? roleById.get(m.workRole.id) : undefined
                const unit = hasApartments ? (unitData ?? []).find((u: SpaceUnit) => u.residentUserId === m.userId) : undefined
                return (
                  <tr
                    key={m.id}
                    tabIndex={0}
                    onClick={() => setOpenId(m.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(m.id) } }}
                    className={cn(
                      "cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
                      openId === m.id && "bg-muted/40",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          {m.user?.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
                          <AvatarFallback className="text-xs">{personInitials(m.user)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-foreground">{m.user ? personName(m.user) : t("scheduling.members.unknownMember")}</span>
                            {external && (
                              <Badge variant="outline" className="shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-400">
                                {t("members.external.badge")}
                              </Badge>
                            )}
                            {/* Neutral: a fact about how they clock here, not something to look at. */}
                            {autoClock.on && !external && autoClock.rowFor(m.userId)?.autoClock === true && (
                              <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                                {t("attendance.autoClock.badge")}
                              </Badge>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {m.user?.position}
                            {unit && (
                              <span className="inline-flex items-center gap-1"><Home className="h-3 w-3" />{unit.name}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.workRole || m.spaceRole ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {m.workRole && <RoleTag role={m.workRole} />}
                          {m.spaceRole && <RoleTag role={m.spaceRole} />}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    {isClient && (
                      <td className="px-4 py-3 text-right">
                        {external ? <span className="text-muted-foreground">—</span> : (
                          <div className="inline-flex flex-col items-end gap-1">
                            <span className="whitespace-nowrap rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] font-semibold">{billByLabel(bill)}</span>
                            {/* Only what is charged: no hourly figure for day-only, no day figure for hour-only. */}
                            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                              {bill !== "DAY" && (
                                <span
                                  className={cn(m.billRateCents != null && "font-semibold text-blue-600 dark:text-blue-400")}
                                  title={m.billRateCents != null ? t("scheduling.membersPage.setForPerson") : t("scheduling.membersPage.inherited")}
                                >
                                  {hourly != null ? `${cents(hourly)} ${t("rates.perHour")}` : "—"}
                                </span>
                              )}
                              {bill === "BOTH" && <span className="mx-1.5 opacity-50">·</span>}
                              {bill !== "HOUR" && (
                                <span title={workRole?.name}>
                                  {workRole?.dayRateCents != null ? `${cents(workRole.dayRateCents)} ${t("rates.perDay")}` : "—"}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">{t("scheduling.membersPage.noMatch")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <MemberPanel
        spaceId={spaceId}
        member={open}
        roles={roles ?? []}
        roster={members ?? []}
        isClient={isClient}
        autoClockRow={autoClock.on && open && open.user?.isExternal !== true ? autoClock.rowFor(open.userId) ?? null : undefined}
        autoClockWorkspace={autoClock.workspace}
        onClose={() => setOpenId(null)}
      />
      {adding && (
        <AddMemberDialog spaceId={spaceId} roles={roles ?? []} members={members ?? []} isClient={isClient} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
