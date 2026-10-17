"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { CalendarClock, Lock, Pencil, Shield, Trash2, Wrench } from "lucide-react"

import { formatMoney, MONEY_LOCALE } from "@/lib/money"
import { useQuery } from "@tanstack/react-query"
import { locationsApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { formatDayKey } from "@/lib/day-key"
import { personInitials, personName, ACCESS_PERMISSION_SCHEMA, type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/**
 * Work roles in a workspace — the trade a person does here, how it is billed,
 * and its day rate here.
 *
 * ⚠️ A WORK ROLE GRANTS NOTHING. These cards never show a permission list, and
 * the editor never offers one: the server forces a trade's permissions empty,
 * and a screen that offered them would be a promise the server breaks.
 */

export type BillBy = "HOUR" | "DAY" | "BOTH"
export const BILL_BY: BillBy[] = ["HOUR", "DAY", "BOTH"]

export const DEFAULT_ROLE_COLOR = "#2563eb"
const SPACE_PERMISSIONS = ACCESS_PERMISSION_SCHEMA.filter((p) => p.scopes.includes("space"))

export const roleQueryKey = (spaceId: string) => keys.spaces.roles(spaceId)

/** "Hour only" / "Day only" / "Hour + Day" — one place, so the card, menu and editor agree. */
export function useBillByLabel() {
  const { t } = useTranslation()
  return (b: BillBy | null | undefined) => (b ? t(`scheduling.workRoles.billBy${b}`) : "")
}

export function useCents(currency = "EUR") {
  return (cents: number) => formatMoney(cents, currency, MONEY_LOCALE)
}

/**
 * What a workspace's money is in: `bill` — the client's rates here (its own
 * currency, else the organization's) — and `cost` — what you pay people, always
 * the organization's. Reads the workspace the page already loaded.
 */
export function useSpaceCurrency(spaceId: string): { bill: string; cost: string } {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: keys.locations.detail(spaceId),
    queryFn: () => locationsApi.getById(spaceId),
    enabled: !!spaceId,
    staleTime: 60_000,
  })
  const cost = data?.organizationCurrency ?? user?.orgCurrency ?? "EUR"
  return { bill: data?.effectiveCurrency ?? cost, cost }
}

/** The page's segmented control — moved to components/ui so the permission builder shares it. */
export { Segmented } from "@/components/ui/segmented"

function Initials({ p }: { p: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } }) {
  return (
    <Avatar className="h-6 w-6 border-2 border-card">
      {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
      <AvatarFallback className="text-[9px]">
        {personInitials(p)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Who holds this role HERE — faces, then names. */
function RoleHolders({ holders }: { holders: SpaceRoleInSpace["holders"] }) {
  const { t } = useTranslation()
  if (holders.length === 0) {
    return <span className="text-xs text-muted-foreground">{t("scheduling.workRoles.nobodyHere")}</span>
  }
  const names = holders.map((h) => personName(h))
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex -space-x-1.5">
        {holders.slice(0, 4).map((h) => <Initials key={h.id} p={h} />)}
      </span>
      <span className="truncate text-xs text-muted-foreground" title={names.join(", ")}>
        {names.slice(0, 3).join(", ")}
        {names.length > 3 && ` +${names.length - 3}`}
      </span>
    </span>
  )
}

/** One role, as a card in the workspace's list. */
export function RoleCard({
  role,
  currency,
  onEdit,
  onDelete,
  onRemoveHere,
}: {
  role: SpaceRoleInSpace
  /** The workspace's billing currency — a day rate is charged to the client. */
  currency?: string
  onEdit: () => void
  onDelete?: () => void
  /** A work role: switch it off in this workspace only (disabled while somebody here holds it). */
  onRemoveHere?: () => void
}) {
  const { t, i18n } = useTranslation()
  const cents = useCents(currency)
  const isWork = role.kind === "WORK"
  const color = role.color || DEFAULT_ROLE_COLOR
  const Icon = isWork ? Wrench : Shield
  const perms = SPACE_PERMISSIONS.filter((p) => role.permissions?.[p.key])
  const scheduled = role.dayRateHistory?.find((h) => h.state === "scheduled")

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}20` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </span>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{role.name}</span>
            {role.isSystem && (
              <Badge
                variant="outline"
                className={"gap-1 border-slate-200 bg-slate-50 text-[11px] text-slate-600 " +
                  "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}
              >
                <Lock className="h-3 w-3" />
                {t("scheduling.roles.builtIn")}
              </Badge>
            )}
            {isWork && (
              <span className="text-xs font-medium tabular-nums text-foreground">
                {role.dayRateCents != null
                  ? `${cents(role.dayRateCents)} ${t("scheduling.workRoles.perDay")}`
                  : <span className="font-normal text-muted-foreground">{t("scheduling.workRoles.dayRateNone")}</span>}
                {role.dayRateSource === "default" && (
                  <span className="ml-1 font-normal text-muted-foreground">· {t("rates.sourceDefault")}</span>
                )}
              </span>
            )}
            {scheduled && (
              <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                <CalendarClock className="h-3 w-3" />
                {scheduled.cents != null ? cents(scheduled.cents) : t("rates.notSet")}{" "}
                {t("rates.from", { date: formatDayKey(scheduled.effectiveFrom, i18n.language) })}
              </span>
            )}
          </div>
          {!isWork && (
            <p className="truncate text-xs text-muted-foreground">
              {perms.length > 0
                ? perms.map((p) => t(`scheduling.roles.permissions.${p.key}.label`, p.label)).join(" · ")
                : t("scheduling.roles.noPermissions")}
            </p>
          )}
          <RoleHolders holders={role.holders} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label={t("common.edit", "Edit")}>
          <Pencil className="h-4 w-4" />
        </Button>
        {onRemoveHere && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={onRemoveHere}
            disabled={role.holders.length > 0}
            title={role.holders.length > 0 ? t("scheduling.workRoles.heldHere") : undefined}
          >
            {t("scheduling.workRoles.removeHere")}
          </Button>
        )}
        {onDelete && !role.isSystem && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-red-600"
            onClick={onDelete}
            aria-label={t("common.delete", "Delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
