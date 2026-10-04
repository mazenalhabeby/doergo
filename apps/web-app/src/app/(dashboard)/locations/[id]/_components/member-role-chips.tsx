"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronDown, Loader2, MoreHorizontal } from "lucide-react"

import { spaceMembersApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import type { SpaceMember, SpaceRole } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { roleQueryKey, useBillByLabel, type BillBy } from "./work-roles"

/**
 * A member's roles in this workspace, as chips under their name.
 *
 * Two slots: the TRADE (a work role — grants nothing, decides billing) and the
 * MANAGEMENT role (permissions). Somebody holds one of each only when they are
 * allowed two, which is a switch in the row's ⋯ menu. What the chips offer is
 * decided by the same shared rule the server enforces, so a chip never offers a
 * change the server would refuse.
 *
 * Changing a role edits the assignment in place — the row, its routing and its
 * history survive. Removing a member and adding them back would not.
 */

type RoleLite = Pick<SpaceRole, "id" | "name" | "color" | "kind" | "billBy">

function useUpdateMember(spaceId: string, memberId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof spaceMembersApi.updateRoles>[2]) =>
      spaceMembersApi.updateRoles(spaceId, memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-members", spaceId] })
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      notify.success(t("scheduling.workRoles.memberSaved"))
    },
    onError: (err: Error) => notify.error(err.message || t("common.error", "Something went wrong")),
  })
}

/** One coloured chip that opens a menu of roles, in labelled groups. */
function RoleChip({
  current,
  groups,
  emptyLabel,
  menuLabel,
  noneLabel,
  pending,
  onPick,
}: {
  current: RoleLite | null
  groups: Array<{ label?: string; roles: RoleLite[] }>
  emptyLabel: string
  menuLabel: string
  noneLabel?: string
  pending: boolean
  onPick: (role: RoleLite | null) => void
}) {
  const tint = current?.color ?? undefined
  const shown = groups.filter((g) => g.roles.length > 0)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        <button
          type="button"
          aria-label={menuLabel}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
            current
              ? "bg-transparent"
              : // An empty slot whispers: dashed and muted until hovered.
                "border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
          style={current ? { borderColor: `${tint}66`, color: tint } : undefined}
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            current && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tint ?? "currentColor" }} />
          )}
          {current ? current.name : emptyLabel}
          <ChevronDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60 group-data-[state=open]:opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{menuLabel}</DropdownMenuLabel>
        {shown.map((g, gi) => (
          <div key={g.label ?? gi}>
            <DropdownMenuSeparator />
            {g.label && shown.length > 1 && (
              <DropdownMenuLabel className="py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </DropdownMenuLabel>
            )}
            {g.roles.map((r) => (
              <DropdownMenuItem key={r.id} onSelect={() => r.id !== current?.id && onPick(r)} className="gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? "hsl(var(--muted-foreground))" }} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.id === current?.id && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {current && noneLabel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onPick(null)} className="gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-current" />
              <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The chips, by four plain rules:
 *
 *   1. Nothing held → one "Add role" chip offering every role (trades first).
 *   2. A trade held → its chip; a management chip too when one is held or the
 *      member is allowed two.
 *   3. Only a management role held → its chip; "+ Work role" when allowed two.
 *   4. An external member → the management slot only: no trade, no billing.
 */
export function MemberRoleChips({
  spaceId,
  member,
  roles,
}: {
  spaceId: string
  member: SpaceMember
  roles: RoleLite[]
}) {
  const { t } = useTranslation()
  const billByLabel = useBillByLabel()
  const update = useUpdateMember(spaceId, member.id)
  const isExternal = member.user?.isExternal === true

  const workRoles = isExternal ? [] : roles.filter((r) => r.kind === "WORK")
  const mgmtRoles = roles.filter((r) => r.kind !== "WORK")
  const work = member.workRole ?? null
  const mgmt = member.spaceRole ?? null
  const allow = member.allowSecondRole === true

  const pickWork = (r: RoleLite | null) => update.mutate({ workRoleId: r?.id ?? null })
  const pickMgmt = (r: RoleLite | null) => update.mutate({ managementRoleId: r?.id ?? null })
  const common = { pending: update.isPending }
  const workGroup = { label: t("scheduling.workRoles.groupWork"), roles: workRoles }
  const mgmtGroup = { label: t("scheduling.workRoles.groupManagement"), roles: mgmtRoles }

  // The member's own billing, when it differs from their trade's.
  const override = member.billBy && work && member.billBy !== work.billBy ? member.billBy : null

  let chips: ReactNode
  if (!work && !mgmt) {
    chips = (
      <RoleChip
        {...common}
        current={null}
        groups={[workGroup, mgmtGroup]}
        emptyLabel={t("scheduling.members.setRole", "Add role")}
        menuLabel={t("scheduling.members.roleFor", "Role in this workspace")}
        onPick={(r) => r && (r.kind === "WORK" ? pickWork(r) : pickMgmt(r))}
      />
    )
  } else {
    chips = (
      <>
        {(work || (allow && workRoles.length > 0)) && (
          <RoleChip
            {...common}
            current={work}
            groups={[workGroup]}
            emptyLabel={t("scheduling.workRoles.addWork")}
            menuLabel={t("scheduling.workRoles.workRoleHere")}
            noneLabel={t("scheduling.workRoles.noWorkRole")}
            onPick={pickWork}
          />
        )}
        {(mgmt || (allow && mgmtRoles.length > 0)) && (
          <RoleChip
            {...common}
            current={mgmt}
            groups={[mgmtGroup]}
            emptyLabel={t("scheduling.workRoles.addManagement")}
            menuLabel={t("scheduling.workRoles.managementRoleHere")}
            noneLabel={t("scheduling.workRoles.noManagementRole")}
            onPick={pickMgmt}
          />
        )}
      </>
    )
  }

  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1">
      {chips}
      {override && (
        <span
          title={t("scheduling.workRoles.differsFromRole")}
          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
        >
          {billByLabel(override)}
        </span>
      )}
    </span>
  )
}

/**
 * The row's ⋯ menu: how this member is billed HERE, and whether they may hold
 * two roles. Both are about this workspace only.
 */
export function MemberBillingMenu({ spaceId, member }: { spaceId: string; member: SpaceMember }) {
  const { t } = useTranslation()
  const billByLabel = useBillByLabel()
  const update = useUpdateMember(spaceId, member.id)
  if (member.user?.isExternal) return null
  const roleBillBy = (member.workRole?.billBy as BillBy | null | undefined) ?? null
  const value = member.billBy ?? "ROLE"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("scheduling.workRoles.billingMenu")}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("scheduling.workRoles.billByFor")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => update.mutate({ billBy: v === "ROLE" ? null : (v as BillBy) })}
        >
          <DropdownMenuRadioItem value="ROLE" className="text-sm">
            {roleBillBy
              ? t("scheduling.workRoles.sameAsRoleWith", { billBy: billByLabel(roleBillBy) })
              : t("scheduling.workRoles.sameAsRole")}
          </DropdownMenuRadioItem>
          {(["HOUR", "DAY", "BOTH"] as const).map((b) => (
            <DropdownMenuRadioItem key={b} value={b} className="text-sm">
              {billByLabel(b)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/*
          ⚠️ Switching it OFF while two roles are held is refused by the server
          with a sentence that says what to do; the switch does not quietly drop
          a role, because dropping the management role removes permissions.
        */}
        <div className="flex items-start justify-between gap-3 px-2 py-1.5">
          <div className="min-w-0">
            <p className="text-sm">{t("scheduling.workRoles.allowSecond")}</p>
            <p className="text-[11px] text-muted-foreground">{t("scheduling.workRoles.allowSecondHint")}</p>
          </div>
          <Switch
            checked={member.allowSecondRole === true}
            onCheckedChange={(v) => update.mutate({ allowSecondRole: v })}
            aria-label={t("scheduling.workRoles.allowSecond")}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
