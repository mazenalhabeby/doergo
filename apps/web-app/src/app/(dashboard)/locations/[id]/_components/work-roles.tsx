"use client"

import { useTranslation } from "react-i18next"
import { CalendarClock, Lock, Pencil, Shield, Trash2, Wrench } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import { formatDayKey } from "@/lib/day-key"
import { ACCESS_PERMISSION_SCHEMA, type SpaceRoleInSpace } from "@hbcfield/shared/client"
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

export const roleQueryKey = (spaceId: string) => ["space-roles-in-space", spaceId] as const

/** "Hour only" / "Day only" / "Hour + Day" — one place, so the card, menu and editor agree. */
export function useBillByLabel() {
  const { t } = useTranslation()
  return (b: BillBy | null | undefined) => (b ? t(`scheduling.workRoles.billBy${b}`) : "")
}

export function useCents(currency = "EUR") {
  return (cents: number) => formatMoney(cents / 100, currency)
}

/** Small segmented control — the page's own idiom for a choice of two or three. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5",
        disabled && "opacity-60",
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "bg-card font-semibold text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Initials({ p }: { p: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } }) {
  return (
    <Avatar className="h-6 w-6 border-2 border-card">
      {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
      <AvatarFallback className="text-[9px]">
        {(p.firstName?.[0] || "") + (p.lastName?.[0] || "")}
      </AvatarFallback>
    </Avatar>
  )
}

/** Who holds this role HERE — faces, then names. */
export function RoleHolders({ holders }: { holders: SpaceRoleInSpace["holders"] }) {
  const { t } = useTranslation()
  if (holders.length === 0) {
    return <span className="text-xs text-muted-foreground">{t("scheduling.workRoles.nobodyHere")}</span>
  }
  const names = holders.map((h) => `${h.firstName} ${h.lastName}`.trim())
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
  onEdit,
  onDelete,
}: {
  role: SpaceRoleInSpace
  onEdit: () => void
  onDelete?: () => void
}) {
  const { t, i18n } = useTranslation()
  const billByLabel = useBillByLabel()
  const cents = useCents()
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
                className="gap-1 border-slate-200 bg-slate-50 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Lock className="h-3 w-3" />
                {t("scheduling.roles.builtIn")}
              </Badge>
            )}
            {isWork && role.billBy && (
              <Badge variant="outline" className="text-[11px] font-medium">
                {billByLabel(role.billBy)}
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
