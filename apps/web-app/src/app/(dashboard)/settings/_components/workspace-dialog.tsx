"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ResolvedHoliday } from "@hbcfield/shared/client"
import { calendarApi, type CalendarSettings } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Combobox } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { keys } from "@/lib/query-keys"

/** Monday first, the way a working week is read. 0 = Sunday … 6 = Saturday. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0]

export const dayName = (d: number, style: "short" | "long" = "short") =>
  new Date(2026, 1, 1 + d).toLocaleDateString(dateLocale(), { weekday: style })

export function useLang() {
  const { i18n } = useTranslation()
  return (i18n.language || "en").slice(0, 2)
}

export function WeekendPicker({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
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
              ("h-10 rounded-xl border text-xs font-medium transition " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                "disabled:opacity-50"),
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
  return useQuery({ queryKey: keys.calendar.countries(lang), queryFn: () => calendarApi.countries(lang), staleTime: Infinity })
}

function useRegions(country: string | null) {
  const lang = useLang()
  return useQuery({
    queryKey: keys.calendar.regions(country, lang),
    queryFn: () => calendarApi.regions(country!, lang),
    enabled: !!country,
    staleTime: Infinity,
  })
}

/** Country + region pickers, both searchable. */
export function PlacePicker({
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
    () => [
      ...(inheritLabel ? [{ value: "", label: inheritLabel }] : []),
      ...countries.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))],
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

export type Ws = CalendarSettings["workspaces"][number]

export function WorkspaceDialog({ ws, onClose, onSaved }: { ws: Ws | null; onClose: () => void; onSaved: () => void }) {
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
    mutationFn: () => calendarApi.updateWorkspace(
      ws!.id,
      { holidayCountry: country, holidayRegion: country ? region : null, weekendDays: ownWeekend ? weekend : [] }),
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
          <PlacePicker
            country={country}
            region={region}
            onChange={(c, r) => { setCountry(c); setRegion(r) }}
            inheritLabel={ws?.detectedCountry
              ? t("holidays.useLocation", { place: `${ws.detectedCountry}${ws.detectedRegion ? ` · ${ws.detectedRegion}` : ""}` })
              : t("holidays.useOrganization")}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("holidays.weekend")}</Label>
              {ownWeekend &&
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => { setOwnWeekend(false); setWeekend(ws?.weekend ?? []) }}>{t("holidays.useOrganization")}</button>}
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

export type Row = ResolvedHoliday & { removed?: boolean }
