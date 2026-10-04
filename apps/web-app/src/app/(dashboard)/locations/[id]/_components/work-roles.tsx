"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, Check, Loader2, Lock, Pencil, Shield, Trash2, Wrench } from "lucide-react"

import { spaceRolesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/money"
import { formatDayKey, todayDayKey } from "@/lib/day-key"
import { ACCESS_PERMISSION_SCHEMA, type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
              </span>
            )}
            {scheduled && (
              <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                <CalendarClock className="h-3 w-3" />
                {scheduled.cents != null ? cents(scheduled.cents) : t("scheduling.workRoles.cleared")}{" "}
                {t("scheduling.workRoles.from", { date: formatDayKey(scheduled.effectiveFrom, i18n.language) })}
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

/**
 * The day-rate history of one work role here, oldest first, with today's rate
 * marked — the record that a change never re-priced the past.
 */
export function DayRateHistory({ role }: { role: SpaceRoleInSpace }) {
  const { t, i18n } = useTranslation()
  const cents = useCents()
  const rows = role.dayRateHistory ?? []
  if (rows.length === 0) return null
  // The latest row that has started is the current one.
  const currentIdx = rows.reduce((acc, r, i) => (r.state === "past" ? i : acc), -1)
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="mb-1.5 text-xs font-semibold text-foreground">{t("scheduling.workRoles.history")}</p>
      <ul className="divide-y divide-border/60">
        {[...rows].reverse().map((r, revIdx) => {
          const i = rows.length - 1 - revIdx
          const state = r.state === "scheduled" ? "stateScheduled" : i === currentIdx ? "stateCurrent" : "stateEarlier"
          return (
            <li key={`${r.effectiveFrom}-${i}`} className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-3 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {t("scheduling.workRoles.from", { date: formatDayKey(r.effectiveFrom, i18n.language) })}
              </span>
              <span className="font-semibold tabular-nums">{r.cents != null ? cents(r.cents) : t("scheduling.workRoles.cleared")}</span>
              <span
                className={cn(
                  "text-right text-[11px]",
                  state === "stateCurrent" && "font-semibold text-green-600 dark:text-green-400",
                  state === "stateScheduled" && "font-semibold text-blue-600 dark:text-blue-400",
                  state === "stateEarlier" && "text-muted-foreground",
                )}
              >
                {t(`scheduling.workRoles.${state}`)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Change (or schedule) a work role's day rate here.
 *
 * ⚠️ It ASKS FOR A START DAY and says, before anything is saved, what stays as
 * it is. "Will last month's work change?" is the first question anybody asks
 * about a rate change; the dialog answers it rather than leaving it to trust.
 */
export function ChangeDayRateDialog({
  spaceId,
  role,
  open,
  onOpenChange,
}: {
  spaceId: string
  role: SpaceRoleInSpace
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const cents = useCents()
  const today = todayDayKey()
  const [value, setValue] = useState(role.dayRateCents != null ? String(role.dayRateCents / 100) : "")
  const [from, setFrom] = useState(today)
  /*
    The FIRST day rate a role has here applies to every day not yet invoiced,
    unless somebody picks a start day — the same rule the server applies. Only a
    start day the person actually chose is sent.
  */
  const firstEver = (role.dayRateHistory?.length ?? 0) === 0
  const [touched, setTouched] = useState(false)
  const sinceAlways = firstEver && !touched

  // What applied the day BEFORE the new rate starts — what the earlier days keep.
  const before = useMemo(() => {
    let r: number | null = null
    for (const h of role.dayRateHistory ?? []) if (h.effectiveFrom < from) r = h.cents
    return r
  }, [role.dayRateHistory, from])

  const nextCents = value.trim() === "" ? null : Math.round(Number(value) * 100)
  const valid = value.trim() === "" || (Number.isFinite(Number(value)) && Number(value) >= 0)
  const date = formatDayKey(from, i18n.language)

  const save = useMutation({
    mutationFn: () =>
      spaceRolesApi.setDayRate(spaceId, role.id, { cents: nextCents, ...(sinceAlways ? {} : { effectiveFrom: from }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      notify.success(!sinceAlways && from > today ? t("scheduling.workRoles.scheduled") : t("scheduling.workRoles.saved"))
      onOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scheduling.workRoles.changeTitle", { role: role.name })}</DialogTitle>
          <DialogDescription>{t("scheduling.workRoles.changeDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="day-rate-new" className="text-xs">{t("scheduling.workRoles.newRate")}</Label>
            <div className="relative">
              <Input
                id="day-rate-new"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 pr-14 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {t("scheduling.workRoles.perDay")}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="day-rate-from" className="text-xs">{t("scheduling.workRoles.startsFrom")}</Label>
            <DatePicker id="day-rate-from" value={from} onChange={(v) => { setFrom(v || today); setTouched(true) }} />
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {sinceAlways ? (
            <li className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
              {t("scheduling.workRoles.firstRate")}
            </li>
          ) : (
          <li className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
            {before != null
              ? t("scheduling.workRoles.keeps", { date, rate: cents(before) })
              : t("scheduling.workRoles.keepsNone", { date })}
          </li>
          )}
          <li className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
            {t("scheduling.workRoles.issuedSafe")}
          </li>
          {!sinceAlways && (
            <li className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
              {nextCents != null
                ? t("scheduling.workRoles.uses", { date, rate: cents(nextCents) })
                : t("scheduling.workRoles.usesNone", { date })}
            </li>
          )}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !valid} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {!sinceAlways && from > today ? t("scheduling.workRoles.schedule") : t("scheduling.workRoles.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
