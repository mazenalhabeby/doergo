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
  organizationsApi,
  rateHistoryApi,
  spaceMembersApi,
  spaceRolesApi,
  spaceUnitsApi,
  type SpaceUnit,
} from "@/lib/api"
import { personInitials, personName, jobTitleOf, type SpaceMember, type SpaceRoleInSpace } from "@hbcfield/shared/client"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DatedRateField } from "@/components/rates/dated-rate"
import { EmptyState } from "./section-header"
import { MemberRoutingEditor } from "./member-routing-editor"
import { BILL_BY, roleQueryKey, Segmented, useBillByLabel, useCents, useSpaceCurrency, type BillBy } from "./work-roles"

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

const NONE = "__none__"


/** One role's coloured dot + name, read-only. */
function RoleTag({ role }: { role?: { name: string; color?: string | null } | null }) {
  if (!role) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.color ?? "hsl(var(--muted-foreground))" }} />
      {role.name}
    </span>
  )
}

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
        onClose={() => setOpenId(null)}
      />
      {adding && (
        <AddMemberDialog spaceId={spaceId} roles={roles ?? []} members={members ?? []} isClient={isClient} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}

/**
 * "Costs you", read from the person's profile, with the margin beside it when
 * both figures are known and in the same currency. Nothing to type here: the
 * link goes to the one place a cost is set.
 */
function CostFromProfile({
  member, bill, hourPrice, dayPrice, priceCurrency, costCurrency,
}: {
  member: SpaceMember
  bill: BillBy
  hourPrice: number | null
  dayPrice: number | null
  priceCurrency: string
  costCurrency: string
}) {
  const { t } = useTranslation()
  const costMoney = useCents(costCurrency)
  const rows = [
    ...(bill !== "DAY" ? [{ key: "hour", label: t("rates.perHourLabel"), cost: member.profileCostRateCents ?? null, price: hourPrice }] : []),
    ...(bill !== "HOUR" ? [{ key: "day", label: t("rates.perDayLabel"), cost: member.profileCostDayCents ?? null, price: dayPrice }] : []),
  ]
  const sameCurrency = priceCurrency === costCurrency
  return (
    <div className="space-y-2 rounded-xl border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">{t("rates.costsYou")}</span>
        <Link href={`/members/${member.userId}`} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
          {t("rates.changeOnProfile")}
        </Link>
      </div>
      {rows.map((r) => {
        const margin = sameCurrency && r.cost != null && r.price != null ? r.price - r.cost : null
        return (
          <div key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right">
              {r.cost != null
                ? <span className="font-semibold tabular-nums">{costMoney(r.cost)}</span>
                : <span className="text-amber-700 dark:text-amber-400">{t("rates.costNotSet")}</span>}
              {margin != null && (
                <span className={cn("block text-[11px] tabular-nums", margin <= 0 ? "text-red-600 dark:text-red-400" : "text-teal-700 dark:text-teal-400")}>
                  {margin <= 0 ? t("rates.costsMoreThanPrice") : t("rates.marginEach", { amount: costMoney(margin) })}
                </span>
              )}
            </span>
          </div>
        )
      })}
      <p className="text-[11px] text-muted-foreground">{t("rates.costsYouHint")}</p>
    </div>
  )
}

/** Everything about one person in this workspace — what the row only shows. */
function MemberPanel({
  spaceId,
  member,
  roles,
  roster,
  isClient,
  onClose,
}: {
  spaceId: string
  member: SpaceMember | null
  roles: SpaceRoleInSpace[]
  roster: SpaceMember[]
  isClient: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const billByLabel = useBillByLabel()
  const money = useSpaceCurrency(spaceId)
  const cents = useCents(money.bill)
  const { user } = useAuth()
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  const [confirmRemove, setConfirmRemove] = useState(false)

  const external = member?.user?.isExternal === true
  // Only the trades this workspace uses — plus the one this person already holds.
  const workRoles = roles.filter((r) => r.kind === "WORK" && (r.activeHere !== false || r.id === member?.workRole?.id))
  const mgmtRoles = roles.filter((r) => r.kind !== "WORK")
  const allow = member?.allowSecondRole === true
  const hasWork = !!member?.workRole
  const hasMgmt = !!member?.spaceRole
  // The management slot is open when nothing else is held, or two roles are allowed.
  const mgmtOpen = !hasWork || allow || hasMgmt
  const workOpen = !external && (!hasMgmt || allow || hasWork)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
    queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
  }
  const update = useMutation({
    mutationFn: (data: Parameters<typeof spaceMembersApi.updateRoles>[2]) => spaceMembersApi.updateRoles(spaceId, member!.id, data),
    onSuccess: () => { invalidate(); notify.success(t("scheduling.workRoles.memberSaved")) },
    onError: (e: Error) => notify.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => spaceMembersApi.remove(spaceId, member!.id),
    onSuccess: () => { invalidate(); notify.success(t("scheduling.members.toast.removed")); setConfirmRemove(false); onClose() },
    onError: (e: Error) => notify.error(e.message),
  })
  const { data: rates } = useQuery({
    queryKey: keys.rates.history("ASSIGNMENT", member?.id),
    queryFn: () => rateHistoryApi.list({ target: "ASSIGNMENT", targetId: member!.id, spaceId }),
    enabled: !!member && isClient && !external,
  })
  const saveRate = async (patch: { billRateCents?: number | null }, from?: string) => {
    await spaceMembersApi.updateRate(spaceId, member!.id, { ...patch, ...(from ? { effectiveFrom: from } : {}) })
    invalidate()
    queryClient.invalidateQueries({ queryKey: keys.rates.history("ASSIGNMENT", member!.id) })
  }

  const workRole = member?.workRole ? roles.find((r) => r.id === member.workRole!.id) : undefined
  const bill = (member?.effectiveBillBy ?? "HOUR") as BillBy
  const section = "space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
  const heading = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"

  return (
    <Sheet open={!!member} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {member && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {member.user?.avatarUrl && <AvatarImage src={member.user.avatarUrl} alt="" />}
                  <AvatarFallback>{personInitials(member.user)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate">{member.user ? personName(member.user) : t("scheduling.members.unknownMember")}</span>
                  <SheetDescription className="truncate text-xs">
                    {jobTitleOf({ position: member.user?.position, memberRole: member.spaceRole }) || t("scheduling.membersPage.inWorkspace")}
                  </SheetDescription>
                </span>
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <section className={section}>
                <h3 className={heading}>{t("scheduling.membersPage.roles")}</h3>
                {!external && (
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm text-muted-foreground">{t("scheduling.workRoles.workRoleHere")}</Label>
                    <Select
                      value={member.workRole?.id ?? NONE}
                      onValueChange={(v) => update.mutate({ workRoleId: v === NONE ? null : v })}
                      disabled={!workOpen || update.isPending}
                    >
                      <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("scheduling.workRoles.noWorkRole")}</SelectItem>
                        {workRoles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                            {r.dayRateCents != null && <span className="ml-1.5 text-xs text-muted-foreground">· {cents(r.dayRateCents)} {t("rates.perDay")}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!external && (
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <Label htmlFor="allow-second" className="text-sm text-muted-foreground">{t("scheduling.workRoles.allowSecond")}</Label>
                      <span className="block text-[11px] text-muted-foreground">{t("scheduling.workRoles.allowSecondHint")}</span>
                    </span>
                    <Switch id="allow-second" checked={allow} onCheckedChange={(v) => update.mutate({ allowSecondRole: v })} disabled={update.isPending} />
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm text-muted-foreground">{t("scheduling.workRoles.managementRoleHere")}</Label>
                  <Select
                    value={member.spaceRole?.id ?? NONE}
                    onValueChange={(v) => update.mutate({ managementRoleId: v === NONE ? null : v })}
                    disabled={!mgmtOpen || update.isPending}
                  >
                    <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("scheduling.workRoles.noManagementRole")}</SelectItem>
                      {mgmtRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!mgmtOpen && <p className="text-[11px] text-muted-foreground">{t("scheduling.membersPage.secondRoleOff")}</p>}
              </section>

              {isClient && !external && (
                <section className={section}>
                  <h3 className={heading}>{t("scheduling.membersPage.billing")}</h3>
                  <Segmented
                    ariaLabel={t("scheduling.workRoles.billBy")}
                    value={bill}
                    onChange={(v) => update.mutate({ billBy: v })}
                    disabled={update.isPending}
                    options={BILL_BY.map((b) => ({ value: b, label: billByLabel(b) }))}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("scheduling.workRoles.billByHint")}</p>
                  {/*
                    Which of their hours the CLIENT is charged. Their own pay and
                    the margin's cost stay on counted time, whatever is chosen.
                  */}
                  {bill !== "DAY" && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-xs font-medium text-foreground">{t("scheduling.membersPage.hoursBasis")}</p>
                      <div role="radiogroup" aria-label={t("scheduling.membersPage.hoursBasis")} className="grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                        {(["COUNTED", "CLOCKED", "SHIFT"] as const).map((b) => {
                          const on = (member.effectiveHoursBasis ?? "COUNTED") === b
                          return (
                            <button
                              key={b}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              disabled={update.isPending}
                              onClick={() => !on && update.mutate({ hoursBasis: b })}
                              className={cn(
                                "rounded-lg px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                on ? "bg-card shadow-sm" : "hover:bg-card/60",
                              )}
                            >
                              <span className="block text-xs font-semibold text-foreground">{t(`scheduling.membersPage.basis.${b}`)}</span>
                              <span className="block text-[11px] text-muted-foreground">{t(`scheduling.membersPage.basis.${b}Hint`)}</span>
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t("scheduling.membersPage.hoursBasisHint")}</p>
                    </div>
                  )}
                </section>
              )}

              {isClient && !external && (
                <section className={section}>
                  <h3 className={heading}>{t("scheduling.membersPage.rates")}</h3>
                  {bill !== "DAY" && (
                    <DatedRateField
                      id={`panel-bill-${member.id}`}
                      label={t("rates.spaceBill")}
                      currency={money.bill}
                      currentCents={member.billRateCents ?? null}
                      emptyLabel={member.inheritedBillRateCents != null ? t("rates.usesDefault", { rate: cents(member.inheritedBillRateCents) }) : undefined}
                      history={rates?.filter((r) => r.kind === "BILL_HOUR")}
                      onSubmit={(c, from) => saveRate({ billRateCents: c }, from)}
                    />
                  )}
                  {bill !== "HOUR" && (
                    <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{t("scheduling.workRoles.dayRate")}</span>
                      <span className="font-semibold tabular-nums">
                        {workRole?.dayRateCents != null
                          ? `${cents(workRole.dayRateCents)} ${t("rates.perDay")}`
                          : <span className="font-normal text-muted-foreground">{workRole ? t("scheduling.workRoles.dayRateNone") : t("scheduling.membersPage.needsWorkRole")}</span>}
                        {workRole && <span className="block text-right text-[11px] font-normal text-muted-foreground">{t("scheduling.membersPage.fromRole", { role: workRole.name })}</span>}
                      </span>
                    </div>
                  )}
                  {/*
                    ⚠️ WHAT THIS PERSON COSTS LIVES ON THEIR PROFILE, read-only
                    here. A second, per-workspace cost read the same on screen
                    and silently won; a client's day rate copied into it made
                    the margin zero (rate-ladder LEVELS_BY_KIND).
                  */}
                  {canViewLabourCost && (
                    <CostFromProfile
                      member={member}
                      bill={bill}
                      hourPrice={member.billRateCents ?? member.inheritedBillRateCents ?? null}
                      dayPrice={workRole?.dayRateCents ?? null}
                      priceCurrency={money.bill}
                      costCurrency={money.cost}
                    />
                  )}
                </section>
              )}

              <section className={section}>
                <h3 className={heading}>{t("scheduling.membersPage.notifications")}</h3>
                <MemberRoutingEditor spaceId={spaceId} member={member} roster={roster} stacked />
              </section>

              <section className={section}>
                <Button variant="ghost" className="gap-1.5 px-0 text-red-600 hover:bg-transparent hover:text-red-700" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-4 w-4" />
                  {t("scheduling.membersPage.removeFromWorkspace")}
                </Button>
              </section>
            </div>

            <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("scheduling.members.removeTitle", "Remove from workspace?")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("scheduling.members.removeConfirm", { name: personName(member.user) })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={remove.isPending}>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={(e) => { e.preventDefault(); remove.mutate() }}
                    disabled={remove.isPending}
                  >
                    {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("scheduling.members.remove", "Remove")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Add somebody: who, their role (trade or management), and — for a trade — how they are billed. */
function AddMemberDialog({
  spaceId,
  roles,
  members,
  isClient,
  onClose,
}: {
  spaceId: string
  roles: SpaceRoleInSpace[]
  members: SpaceMember[]
  isClient: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const billByLabel = useBillByLabel()
  const [userId, setUserId] = useState("")
  const [roleId, setRoleId] = useState(NONE)
  const [bill, setBill] = useState<BillBy>("HOUR")

  /*
    Everyone on the staff — admins and managers included — paged through, not
    the first hundred. `lite`: a name, an avatar and a job title is all a picker draws.
  */
  //
  // ⚠️ The directory is `canManageUsers`; a workspace manager adds people
  // (canManageWorkspaces in the space) without holding it. For them the
  // candidates are the people on the workspaces they can see — the most this
  // product lets them read (lib/assignable-members.ts).
  const { user } = useAuth()
  const mayListOrg = mayListOrgMembers(user)
  const { data: orgPeople } = useQuery({
    queryKey: keys.members.directoryLite(),
    queryFn: () => organizationsApi.getAllMembers({ lite: true }),
    enabled: mayListOrg,
  })
  const { members: visiblePeople } = useAssignableMembers({ enabled: !mayListOrg })
  const assigned = new Set(members.map((m) => m.userId))
  const candidates: AssignablePerson[] = mayListOrg ? (orgPeople ?? []) : visiblePeople
  const available = candidates.filter((e) => e.isActive !== false && !assigned.has(e.id))
  const dupes = useMemo(() => {
    const seen = new Set<string>(), d = new Set<string>()
    for (const e of available) { const n = personName(e).toLowerCase(); if (seen.has(n)) d.add(n); seen.add(n) }
    return d
  }, [available])
  const picked = roles.find((r) => r.id === roleId)

  const add = useMutation({
    mutationFn: async () => {
      const m = await spaceMembersApi.assign(spaceId, { userId, spaceRoleId: roleId === NONE ? null : roleId })
      // Billing only means something for a trade on a client's workspace.
      if (m?.id && picked?.kind === "WORK" && isClient && bill !== "HOUR") {
        await spaceMembersApi.updateRoles(spaceId, m.id, { billBy: bill })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      notify.success(t("scheduling.members.toast.added"))
      onClose()
    },
    onError: (e: Error) => notify.error(e.message || t("scheduling.members.toast.addFailed")),
  })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scheduling.membersPage.addMember")}</DialogTitle>
          <DialogDescription>{t("scheduling.members.intro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("scheduling.members.fields.member")}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder={t("scheduling.members.selectMember")} /></SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <div className="p-2 text-center text-sm text-muted-foreground">{t("scheduling.members.noAvailable")}</div>
                ) : available.map((e) => {
                  const title = jobTitleOf(e)
                  const showEmail = dupes.has(personName(e).toLowerCase())
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="flex flex-col items-start">
                        <span>{personName(e)}</span>
                        {(title || showEmail) && <span className="text-xs text-muted-foreground">{[title, showEmail ? e.email : null].filter(Boolean).join(" · ")}</span>}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("scheduling.members.fields.role")}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("scheduling.members.noRole")}</SelectItem>
                {([["WORK", t("scheduling.workRoles.groupWork")], ["MANAGEMENT", t("scheduling.workRoles.groupManagement")]] as const).map(([kind, label]) => {
                  // Work roles: only those this workspace uses.
                  const group = roles.filter((r) => (r.kind === "WORK") === (kind === "WORK") && (r.kind !== "WORK" || r.activeHere !== false))
                  if (group.length === 0) return null
                  return (
                    <SelectGroup key={kind}>
                      <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</SelectLabel>
                      {group.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          {picked?.kind === "WORK" && isClient && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("scheduling.workRoles.billBy")}</Label>
              <div>
                <Segmented ariaLabel={t("scheduling.workRoles.billBy")} value={bill} onChange={setBill} options={BILL_BY.map((b) => ({ value: b, label: billByLabel(b) }))} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={add.isPending}>{t("common.cancel")}</Button>
          <Button onClick={() => add.mutate()} disabled={!userId || add.isPending} className="gap-1.5">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {t("scheduling.members.addButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
