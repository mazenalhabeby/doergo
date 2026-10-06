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

/** Monday first, the way a working week is read. 0 = Sunday … 6 = Saturday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const dayName = (d: number, style: "short" | "long" = "short") =>
  new Date(2026, 1, 1 + d).toLocaleDateString(dateLocale(), { weekday: style })

function useLang() {
  const { i18n } = useTranslation()
  return (i18n.language || "en").slice(0, 2)
}

function WeekendPicker({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t("holidays.weekend")}>
      {WEEK.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => {
              const next = on ? value.filter((x) => x !== d) : [...value, d]
              if (next.length > 6) return
              onChange(next)
            }}
            className={cn(
              "h-10 rounded-xl border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              on
                ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {dayName(d)}
          </button>
        )
      })}
    </div>
  )
}

function useCountries() {
  const lang = useLang()
  return useQuery({ queryKey: ["calendar-countries", lang], queryFn: () => calendarApi.countries(lang), staleTime: Infinity })
}

function useRegions(country: string | null) {
  const lang = useLang()
  return useQuery({
    queryKey: ["calendar-regions", country, lang],
    queryFn: () => calendarApi.regions(country!, lang),
    enabled: !!country,
    staleTime: Infinity,
  })
}

/** Country + region pickers, both searchable. */
function PlacePicker({
  country, region, onChange, inheritLabel,
}: {
  country: string | null
  region: string | null
  onChange: (country: string | null, region: string | null) => void
  inheritLabel?: string
}) {
  const { t } = useTranslation()
  const { data: countries = [] } = useCountries()
  const { data: regions = [] } = useRegions(country)
  const countryOptions = useMemo(
    () => [...(inheritLabel ? [{ value: "", label: inheritLabel }] : []), ...countries.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))],
    [countries, inheritLabel],
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t("holidays.country")}</Label>
        <Combobox
          value={country ?? ""}
          onChange={(v) => onChange(v || null, null)}
          options={countryOptions}
          placeholder={t("holidays.chooseCountry")}
          searchPlaceholder={t("holidays.searchCountry")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("holidays.region")}</Label>
        <Combobox
          value={region ?? ""}
          onChange={(v) => onChange(country, v || null)}
          options={[{ value: "", label: t("holidays.wholeCountry") }, ...regions.map((r) => ({ value: r.code, label: r.name }))]}
          placeholder={t("holidays.wholeCountry")}
          searchPlaceholder={t("holidays.searchRegion")}
        />
      </div>
    </div>
  )
}

type Ws = CalendarSettings["workspaces"][number]

/** Holidays & weekends — the settings behind the calendar and every leave count. */
export function HolidaysSection() {
  const { t } = useTranslation()
  const lang = useLang()
  const qc = useQueryClient()
  const year = new Date().getFullYear()
  const { data, isLoading } = useQuery({ queryKey: ["calendar-settings", year, lang], queryFn: () => calendarApi.settings(year, lang) })
  const [editWs, setEditWs] = useState<Ws | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["calendar-settings"] })
    qc.invalidateQueries({ queryKey: ["calendar-holidays"] })
    qc.invalidateQueries({ queryKey: ["calendar"] })
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
                    <td className="px-2 py-3 font-medium">{w.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{t("holidays.people", { count: w.people })}</span></td>
                    <td className="px-2 py-3">
                      <span className={cn(w.inherited.holidays && "text-muted-foreground")}>
                        {w.country ?? "—"}{w.region ? ` · ${w.region}` : ""}
                        {w.inherited.holidays && <span className="ml-1.5 text-xs italic">({t("holidays.inherited")})</span>}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex flex-wrap gap-1">
                        {WEEK.filter((d) => w.weekend.includes(d)).map((d) => (
                          <span key={d} className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", w.inherited.weekend ? "bg-muted text-muted-foreground" : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>{dayName(d)}</span>
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-3 tabular-nums">
                      {w.holidayCount}
                      {w.estimatedCount > 0 && <span className="ml-2 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("holidays.estimatedCount", { count: w.estimatedCount })}</span>}
                    </td>
                    <td className="px-2 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditWs(w)}><Pencil className="mr-1.5 h-3.5 w-3.5" />{t("common.edit", "Edit")}</Button></td>
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

function WorkspaceDialog({ ws, onClose, onSaved }: { ws: Ws | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [country, setCountry] = useState<string | null>(null)
  const [region, setRegion] = useState<string | null>(null)
  /*
    The picker starts from the weekend that APPLIES here — the organization's when this workspace
    has none of its own — so clicking adjusts what is really in force. Only once a day is touched
    does the workspace get a weekend of its own; "Use the organization's" goes back to inheriting.
  */
  const [weekend, setWeekend] = useState<number[]>([])
  const [ownWeekend, setOwnWeekend] = useState(false)
  const [seen, setSeen] = useState<string | null>(null)
  if (ws && seen !== ws.id) {
    setSeen(ws.id)
    setCountry(ws.holidayCountry)
    setRegion(ws.holidayRegion)
    setOwnWeekend(ws.weekendDays.length > 0)
    setWeekend(ws.weekendDays.length ? ws.weekendDays : ws.weekend)
  }
  const save = useMutation({
    mutationFn: () => calendarApi.updateWorkspace(ws!.id, { holidayCountry: country, holidayRegion: country ? region : null, weekendDays: ownWeekend ? weekend : [] }),
    onSuccess: () => { onSaved(); toast.success(t("holidays.saved")); onClose(); setSeen(null) },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })
  return (
    <Dialog open={!!ws} onOpenChange={(o) => { if (!o) { onClose(); setSeen(null) } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ws?.name}</DialogTitle>
          <DialogDescription>{t("holidays.workspaceDialogBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <PlacePicker country={country} region={region} onChange={(c, r) => { setCountry(c); setRegion(r) }} inheritLabel={t("holidays.useOrganization")} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("holidays.weekend")}</Label>
              {ownWeekend && <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => { setOwnWeekend(false); setWeekend(ws?.weekend ?? []) }}>{t("holidays.useOrganization")}</button>}
            </div>
            <WeekendPicker value={weekend} onChange={(v) => { if (v.length) { setWeekend(v); setOwnWeekend(true) } }} />
            {!ownWeekend && <p className="text-xs text-muted-foreground">{t("holidays.inheritsWeekend")}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClose(); setSeen(null) }}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Row = ResolvedHoliday & { removed?: boolean }

function HolidayList({ settings, year: thisYear }: { settings: CalendarSettings; year: number }) {
  const { t } = useTranslation()
  const lang = useLang()
  const qc = useQueryClient()
  const [scope, setScope] = useState<string>("")
  const [year, setYear] = useState(thisYear)
  const [edit, setEdit] = useState<{ row?: Row | null } | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["calendar-holidays", scope, year, lang],
    queryFn: () => calendarApi.holidays({ spaceId: scope || null, year, lang }),
  })
  const scopes = [{ id: "", name: t("holidays.organization") }, ...settings.workspaces.filter((w) => !w.inherited.holidays).map((w) => ({ id: w.id, name: w.name }))]
  const done = () => {
    qc.invalidateQueries({ queryKey: ["calendar-holidays"] })
    qc.invalidateQueries({ queryKey: ["calendar-settings"] })
    qc.invalidateQueries({ queryKey: ["calendar"] })
  }
  const save = useMutation({
    mutationFn: calendarApi.saveHoliday,
    onSuccess: () => { done(); toast.success(t("holidays.saved")) },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })
  const remove = useMutation({
    mutationFn: calendarApi.removeHoliday,
    onSuccess: () => { done(); toast.success(t("holidays.saved")) },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })
  const libraryChange = (h: Row, change: Partial<{ date: string; days: number; name: string; halfDay: boolean; confirmed: boolean; removed: boolean }>) =>
    save.mutate({
      spaceId: scope || null, libraryKey: h.kind === "PUBLIC" ? h.key : null, id: h.kind === "COMPANY" ? h.id : null,
      date: change.date ?? h.date, days: change.days ?? h.days, name: change.name ?? h.name,
      halfDay: change.halfDay ?? h.halfDay, confirmed: change.confirmed ?? h.status === "CONFIRMED", removed: change.removed ?? !!h.removed,
    })

  return (
    <SettingCard
      icon={CalendarDays}
      iconColor="text-rose-600 dark:text-rose-400"
      iconBg="bg-rose-500/10"
      title={t("holidays.listTitle")}
      description={t("holidays.listBody")}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-xl border bg-muted/40 p-0.5">
          {scopes.map((s) => (
            <button key={s.id} type="button" onClick={() => setScope(s.id)} className={cn("rounded-lg px-3 py-1 text-[13px] font-medium text-muted-foreground", scope === s.id && "bg-background text-foreground shadow-sm ring-1 ring-border")}>{s.name}</button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border bg-muted/40 p-0.5">
          {[thisYear, thisYear + 1].map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className={cn("rounded-lg px-3 py-1 text-[13px] font-medium tabular-nums text-muted-foreground", year === y && "bg-background text-foreground shadow-sm ring-1 ring-border")}>{y}</button>
          ))}
        </div>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setEdit({ row: null })}><CalendarPlus className="h-4 w-4" />{t("holidays.addCompanyDay")}</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : !data?.holidays.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{data?.place.country ? t("holidays.none") : t("holidays.chooseCountryFirst")}</p>
      ) : (
        <div className="divide-y">
          {data.holidays.map((h) => {
            const d = new Date(`${h.date}T12:00:00`)
            return (
              <div key={h.key + h.date} className={cn("grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 py-3 sm:grid-cols-[52px_minmax(0,1fr)_auto_auto]", h.removed && "opacity-50")}>
                <div className="overflow-hidden rounded-xl border text-center">
                  <div className="bg-rose-500/10 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">{d.toLocaleDateString(dateLocale(), { month: "short" })}</div>
                  <div className="py-1 text-lg font-semibold tabular-nums leading-none">{d.getDate()}</div>
                </div>
                <div className="min-w-0">
                  <div className={cn("truncate text-sm font-medium", h.removed && "line-through")}>{h.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.days > 1 ? t("holidays.daysRange", { count: h.days, end: new Date(`${h.endDate}T12:00:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" }) }) : d.toLocaleDateString(dateLocale(), { weekday: "long" })}
                    {h.halfDay && ` · ${t("holidays.halfDay")}`}
                    {h.kind === "COMPANY" && ` · ${t("holidays.companyDay")}`}
                  </div>
                </div>
                <span className="justify-self-start sm:justify-self-end">
                  {h.removed ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("holidays.notObserved")}</span>
                  ) : h.status === "ESTIMATED" ? (
                    <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("holidays.estimated")}</span>
                  ) : h.status === "CONFIRMED" ? (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t("holidays.confirmed")}</span>
                  ) : null}
                </span>
                <span className="col-span-2 flex flex-wrap justify-end gap-1 sm:col-span-1">
                  {h.status === "ESTIMATED" && !h.removed && (
                    <Button size="sm" className="h-8 gap-1" onClick={() => libraryChange(h, { confirmed: true })}><Check className="h-3.5 w-3.5" />{t("holidays.confirm")}</Button>
                  )}
                  {!h.removed && (
                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setEdit({ row: h })}><Pencil className="h-3.5 w-3.5" />{h.kind === "PUBLIC" ? t("holidays.move") : t("common.edit", "Edit")}</Button>
                  )}
                  {h.kind === "PUBLIC" && !h.removed && (
                    <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => libraryChange(h, { removed: true })}>{t("holidays.dontObserve")}</Button>
                  )}
                  {h.kind === "PUBLIC" && h.changed && h.id && (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={() => remove.mutate(h.id!)}><RotateCcw className="h-3.5 w-3.5" />{t("holidays.restore")}</Button>
                  )}
                  {h.kind === "COMPANY" && h.id && (
                    <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" aria-label={t("holidays.delete")} onClick={() => remove.mutate(h.id!)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <HolidayDialog
        open={!!edit}
        row={edit?.row ?? null}
        onClose={() => setEdit(null)}
        onSave={(v) => {
          if (edit?.row) libraryChange(edit.row, v)
          else save.mutate({ spaceId: scope || null, ...v })
          setEdit(null)
        }}
      />
    </SettingCard>
  )
}

function HolidayDialog({ open, row, onClose, onSave }: {
  open: boolean
  row: Row | null
  onClose: () => void
  onSave: (v: { date: string; days: number; name: string; halfDay: boolean; confirmed?: boolean }) => void
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState("")
  const [days, setDays] = useState(1)
  const [name, setName] = useState("")
  const [half, setHalf] = useState(false)
  const [seen, setSeen] = useState<string | null>(null)
  const key = open ? row?.key ?? "new" : null
  if (key !== seen) {
    setSeen(key)
    setDate(row?.date ?? "")
    setDays(row?.days ?? 1)
    setName(row?.name ?? "")
    setHalf(row?.halfDay ?? false)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? row.name : t("holidays.addCompanyDay")}</DialogTitle>
          <DialogDescription>{row?.kind === "PUBLIC" ? t("holidays.moveBody") : t("holidays.companyDayBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5"><Label htmlFor="hol-date">{t("holidays.firstDay")}</Label><Input id="hol-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="hol-days">{t("holidays.lasts")}</Label><Input id="hol-days" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="hol-name">{t("holidays.name")}</Label><Input id="hol-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
            <Label htmlFor="hol-half" className="font-normal">{t("holidays.halfDayLabel")}</Label>
            <Switch id="hol-half" checked={half} onCheckedChange={setHalf} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!date || !name.trim()} onClick={() => onSave({ date, days, name: name.trim(), halfDay: half, ...(row?.status === "ESTIMATED" ? { confirmed: true } : {}) })}>{t("common.save", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
