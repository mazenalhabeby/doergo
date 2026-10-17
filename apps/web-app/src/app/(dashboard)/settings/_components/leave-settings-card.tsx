"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, CalendarDays, Loader2 } from "lucide-react"
import { CARRY_OVER_MODES, LEAVE_YEAR_MODES, type CarryOverMode, type LeaveYearMode } from "@hbcfield/shared/client"
import { organizationsApi, type LeavePolicyFields } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { cn } from "@/lib/utils"
import { useRouteAccess } from "@/hooks/use-route-access"
import { Button } from "@/components/ui/button"
import { SettingCard } from "./setting-card"

const inputClass =
  "w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none transition-colors focus:border-primary"

/** A whole number from a field, or null for empty; NaN when it is not one. */
const intOrNull = (s: string): number | null => (s.trim() === "" ? null : /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN)

/**
 * Leave, as the organization decides it: the annual days, which year they run
 * in, and what happens to days left at its end. ADMIN only, like every
 * organization setting (PATCH /organizations/leave-policy is @Roles(ADMIN)).
 *
 * The leave year and carry-over rows appear only when the server reports them
 * on the profile — an older server knows only the allowance, and is never asked
 * to store a rule it would drop.
 */
export function LeaveSettingsCard({ profile }: { profile: LeavePolicyFields | undefined }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const opensOpening = useRouteAccess().may("/employees/leave-opening")
  const ledger = profile?.leaveYearMode !== undefined

  const stored = {
    days: profile?.defaultLeaveAllowance !== undefined ? String(profile.defaultLeaveAllowance) : "",
    year: (profile?.leaveYearMode ?? "CALENDAR") as LeaveYearMode,
    carry: (profile?.carryOverMode ?? "NONE") as CarryOverMode,
    max: profile?.carryOverMaxDays != null ? String(profile.carryOverMaxDays) : "",
    expiry: profile?.carryExpiresAfterMonths != null ? String(profile.carryExpiresAfterMonths) : "",
  }
  const [edit, setEdit] = useState<Partial<typeof stored>>({})
  const v = { ...stored, ...edit }
  const dirty = (Object.keys(edit) as (keyof typeof stored)[]).some((k) => edit[k] !== stored[k])

  const days = intOrNull(v.days)
  const max = intOrNull(v.max)
  const expiry = intOrNull(v.expiry)
  const invalid =
    days === null || Number.isNaN(days) || days > 100 ||
    (ledger && v.carry === "UP_TO" && (max === null || Number.isNaN(max) || max < 1 || max > 100)) ||
    (ledger && v.carry !== "NONE" && (Number.isNaN(expiry) || (expiry !== null && (expiry < 1 || expiry > 24))))

  const save = useMutation({
    mutationFn: () =>
      organizationsApi.updateLeavePolicy({
        defaultLeaveAllowance: days as number,
        ...(ledger
          ? {
              leaveYearMode: v.year,
              carryOverMode: v.carry,
              carryOverMaxDays: v.carry === "UP_TO" ? (max as number) : null,
              carryExpiresAfterMonths: v.carry === "NONE" ? null : expiry,
            }
          : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.organization.profile() })
      // Every balance is measured against these rules and is cached on its own.
      qc.invalidateQueries({ queryKey: keys.timeOff.myBalance() })
      qc.invalidateQueries({ queryKey: keys.timeOff.ledger() })
      setEdit({})
      notify.success(t("settings.leave.saved"))
    },
    onError: (e: Error) => notify.error(serverErrorMessage(e, t) || t("common.error")),
  })

  return (
    <SettingCard
      icon={CalendarDays}
      iconColor="text-emerald-600"
      iconBg="bg-emerald-50"
      title={t("settings.leave.title")}
      description={t("settings.leave.description")}
    >
      {/* Shown once, until the starting balances are saved — the one-time step of starting mid-year. */}
      {ledger && profile?.leaveTrackingStartedOn === null && opensOpening && (
        <Link
          href="/employees/leave-opening"
          className={"group mb-5 flex items-center gap-3 rounded-xl border border-primary/30 " +
            "bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{t("leaveLedger.banner.title")}</span>
            <span className="block text-xs text-muted-foreground">{t("leaveLedger.banner.body")}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="leave-days" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("settings.leave.label")}
          </label>
          <input
            id="leave-days"
            type="number"
            min={0}
            max={100}
            value={v.days}
            onChange={(e) => setEdit((s) => ({ ...s, days: e.target.value }))}
            className={inputClass}
          />
          {/* Says what the number does NOT override: the per-member field is on another screen. */}
          <p className="mt-2 text-xs text-muted-foreground">{t("settings.leave.hint")}</p>
        </div>

        {ledger && (
          <>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t("leaveLedger.settings.yearLabel")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {LEAVE_YEAR_MODES.map((m) => (
                  <Choice
                    key={m}
                    name="leave-year"
                    checked={v.year === m}
                    onChange={() => setEdit((s) => ({ ...s, year: m }))}
                    title={t(`leaveLedger.settings.year.${m}.label`)}
                    hint={t(`leaveLedger.settings.year.${m}.hint`)}
                  />
                ))}
              </div>
              {/* Austria (UrlG): the work year is the legal default unless the company agreed on the calendar year. */}
              <p className="mt-2 text-xs text-muted-foreground">{t("leaveLedger.settings.austriaNote")}</p>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t("leaveLedger.settings.carryLabel")}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {CARRY_OVER_MODES.map((m) => (
                  <Choice
                    key={m}
                    name="carry-over"
                    checked={v.carry === m}
                    onChange={() => setEdit((s) => ({ ...s, carry: m }))}
                    title={t(`leaveLedger.settings.carry.${m}`)}
                  />
                ))}
              </div>
              {v.carry !== "NONE" && (
                <div className="mt-3 flex flex-wrap gap-4">
                  {v.carry === "UP_TO" && (
                    <div>
                      <label htmlFor="carry-max" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        {t("leaveLedger.settings.maxDays")}
                      </label>
                      <input
                        id="carry-max"
                        type="number"
                        min={1}
                        max={100}
                        value={v.max}
                        onChange={(e) => setEdit((s) => ({ ...s, max: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  )}
                  <div>
                    <label htmlFor="carry-expiry" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t("leaveLedger.settings.expiry")}
                    </label>
                    <input
                      id="carry-expiry"
                      type="number"
                      min={1}
                      max={24}
                      placeholder={t("leaveLedger.settings.never")}
                      value={v.expiry}
                      onChange={(e) => setEdit((s) => ({ ...s, expiry: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{t("leaveLedger.settings.carryHint")}</p>
            </fieldset>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button size="sm" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("common.save")}
          </Button>
          {ledger && opensOpening && (
            <Link
              href="/employees/leave-opening"
              className={"text-xs font-medium text-muted-foreground underline-offset-2 " + "hover:text-foreground hover:underline"}>
              {t("leaveLedger.opening.link")}
            </Link>
          )}
        </div>
      </div>
    </SettingCard>
  )
}

function Choice(
  { name, checked, onChange, title, hint }: { name: string; checked: boolean; onChange: () => void; title: string; hint?: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-primary" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
