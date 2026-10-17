"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ResolvedHoliday } from "@hbcfield/shared/client"
import { Building, CalendarDays, CalendarPlus, Check, CornerDownRight, Globe2, Link2, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { calendarApi, type CalendarSettings } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SettingCard } from "./setting-card"
import { keys } from "@/lib/query-keys"
import {
  WEEK,
  dayName,
  useLang,
  WeekendPicker,
  PlacePicker,
  type Ws,
  WorkspaceDialog,
  type Row,
} from "./workspace-dialog"
import { HolidayList } from "./holiday-list"

/** Holidays & weekends — the settings behind the calendar and every leave count. */
export function HolidaysSection() {
  const { t } = useTranslation()
  const lang = useLang()
  const qc = useQueryClient()
  const year = new Date().getFullYear()
  const { data, isLoading } = useQuery({ queryKey: keys.calendar.settings(year, lang), queryFn: () => calendarApi.settings(year, lang) })
  const [editWs, setEditWs] = useState<Ws | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.calendar.settings() })
    qc.invalidateQueries({ queryKey: keys.calendar.holidays() })
    qc.invalidateQueries({ queryKey: keys.calendar.all() })
  }
  const saveOrg = useMutation({
    mutationFn: calendarApi.updateOrg,
    onSuccess: () => { refresh(); toast.success(t("holidays.saved")) },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  if (isLoading || !data) {
    return <div className="space-y-6"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div>
  }
  const org = data.organization
  const orgCountry = org.holidayCountry ?? org.addressCountry ?? null

  return (
    <div className="space-y-6">
      <SettingCard
        icon={Building}
        iconColor="text-blue-600 dark:text-blue-400"
        iconBg="bg-blue-500/10"
        title={t("holidays.orgTitle")}
        description={t("holidays.orgBody")}
      >
        <div className="space-y-5">
          <PlacePicker
            country={orgCountry}
            region={org.holidayRegion}
            onChange={(c, r) => saveOrg.mutate({ holidayCountry: c, holidayRegion: r })}
          />
          <div className="space-y-2">
            <Label>{t("holidays.weekend")}</Label>
            <WeekendPicker
              value={org.weekendDays}
              disabled={saveOrg.isPending}
              onChange={(v) => v.length ? saveOrg.mutate({ weekendDays: v }) : toast.error(t("holidays.weekendNeedsOne"))}
            />
            <p className="text-xs text-muted-foreground">{t("holidays.weekendHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="rounded-md bg-background px-2 py-1 ring-1 ring-border">{t("holidays.layerOrg")}</span>
            <CornerDownRight className="h-3.5 w-3.5" />
            <span className="rounded-md bg-background px-2 py-1 ring-1 ring-border">{t("holidays.layerWorkspace")}</span>
            <CornerDownRight className="h-3.5 w-3.5" />
            <span className="rounded-md bg-primary/10 px-2 py-1 text-primary ring-1 ring-primary/30">{t("holidays.layerPerson")}</span>
            <span>{t("holidays.layersRule")}</span>
          </div>
        </div>
      </SettingCard>

      <SettingCard
        icon={Globe2}
        iconColor="text-emerald-600 dark:text-emerald-400"
        iconBg="bg-emerald-500/10"
        title={t("holidays.workspacesTitle")}
        description={t("holidays.workspacesBody")}
      >
        {data.workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("holidays.noWorkspaces")}</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 pb-2 font-semibold">{t("holidays.workspace")}</th>
                  <th className="px-2 pb-2 font-semibold">{t("holidays.countryRegion")}</th>
                  <th className="px-2 pb-2 font-semibold">{t("holidays.weekend")}</th>
                  <th className="px-2 pb-2 font-semibold">{t("holidays.holidaysYear", { year })}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.workspaces.map((w) => (
                  <tr key={w.id} className="border-t">
                    <td
                      className="px-2 py-3 font-medium">{w.name}<span
                        className="ml-2 text-xs font-normal text-muted-foreground">{t("holidays.people", { count: w.people })}</span></td>
                    <td className="px-2 py-3">
                      <span className={cn(w.holidaySource !== "CHOSEN" && "text-muted-foreground")}>
                        {w.country ?? "—"}{w.region ? ` · ${w.region}` : ""}
                        {w.holidaySource === "ORGANIZATION" && <span className="ml-1.5 text-xs italic">({t("holidays.inherited")})</span>}
                        {w.holidaySource === "LOCATION" && <span className="ml-1.5 text-xs italic">({t("holidays.fromAddress")})</span>}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex flex-wrap gap-1">
                        {WEEK.filter((d) => w.weekend.includes(d)).map((d) => (
                          <span
                            key={d}
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                              w.inherited.weekend
                                ? "bg-muted text-muted-foreground"
                                : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>{dayName(d)}</span>
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-3 tabular-nums">
                      {w.holidayCount}
                      {w.estimatedCount > 0 &&
                        <span
                          className={"ml-2 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium " +
                            "text-amber-700 dark:text-amber-300"}>{t("holidays.estimatedCount", { count: w.estimatedCount })}</span>}
                    </td>
                    <td
                      className="px-2 py-3 text-right"><Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditWs(w)}><Pencil className="mr-1.5 h-3.5 w-3.5" />{t("common.edit", "Edit")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingCard>

      <HolidayList settings={data} year={year} />

      <SettingCard
        icon={Link2}
        iconColor="text-violet-600 dark:text-violet-400"
        iconBg="bg-violet-500/10"
        title={t("holidays.feedTitle")}
        description={t("holidays.feedBody")}
      >
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="cal-feeds" className="text-sm font-medium">{t("holidays.feedToggle")}</Label>
          <Switch id="cal-feeds" checked={org.calendarFeedsEnabled} onCheckedChange={(v) => saveOrg.mutate({ calendarFeedsEnabled: v })} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("holidays.feedOff")}</p>
      </SettingCard>

      <p className="px-1 text-[11px] text-muted-foreground">{t("holidays.attribution")}</p>

      <WorkspaceDialog ws={editWs} onClose={() => setEditWs(null)} onSaved={refresh} />
    </div>
  )
}
