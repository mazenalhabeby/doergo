"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { CalendarDays, CalendarPlus, Check, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { calendarApi, type CalendarSettings } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SettingCard } from "./setting-card"
import { keys } from "@/lib/query-keys"
import { useLang, type Row } from "./workspace-dialog"

export function HolidayList({ settings, year: thisYear }: { settings: CalendarSettings; year: number }) {
  const { t } = useTranslation()
  const lang = useLang()
  const qc = useQueryClient()
  const [scope, setScope] = useState<string>("")
  const [year, setYear] = useState(thisYear)
  const [edit, setEdit] = useState<{ row?: Row | null } | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: keys.calendar.holidays(scope, year, lang),
    queryFn: () => calendarApi.holidays({ spaceId: scope || null, year, lang }),
  })
  const scopes = [
    { id: "", name: t("holidays.organization") },
    ...settings.workspaces.filter((w) => w.ownList).map((w) => ({ id: w.id, name: w.name }))]
  const done = () => {
    qc.invalidateQueries({ queryKey: keys.calendar.holidays() })
    qc.invalidateQueries({ queryKey: keys.calendar.settings() })
    qc.invalidateQueries({ queryKey: keys.calendar.all() })
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
  const libraryChange = (
    h: Row,
    change: Partial<{ date: string; days: number; name: string; halfDay: boolean; confirmed: boolean; removed: boolean }>) =>
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
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              className={cn(
                "rounded-lg px-3 py-1 text-[13px] font-medium text-muted-foreground",
                scope === s.id && "bg-background text-foreground shadow-sm ring-1 ring-border")}>{s.name}</button>
          ))}
        </div>
        <div className="inline-flex rounded-xl border bg-muted/40 p-0.5">
          {[thisYear, thisYear + 1].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                ("rounded-lg px-3 py-1 text-[13px] font-medium tabular-nums " + "text-muted-foreground"),
                year === y && "bg-background text-foreground shadow-sm ring-1 ring-border")}>{y}</button>
          ))}
        </div>
        <Button
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => setEdit({ row: null })}><CalendarPlus className="h-4 w-4" />{t("holidays.addCompanyDay")}</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : !data?.holidays.length ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground">{data?.place.country
            ? t("holidays.none")
            : t("holidays.chooseCountryFirst")}</p>
      ) : (
        <div className="divide-y">
          {data.holidays.map((h) => {
            const d = new Date(`${h.date}T12:00:00`)
            return (
              <div
                key={h.key + h.date}
                className={cn(
                  ("grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 py-3 " + "sm:grid-cols-[52px_minmax(0,1fr)_auto_auto]"),
                  h.removed && "opacity-50")}>
                <div className="overflow-hidden rounded-xl border text-center">
                  <div
                    className={"bg-rose-500/10 py-0.5 text-[9.5px] font-bold uppercase tracking-wider " +
                      "text-rose-600 dark:text-rose-300"}>{d.toLocaleDateString(dateLocale(), { month: "short" })}</div>
                  <div className="py-1 text-lg font-semibold tabular-nums leading-none">{d.getDate()}</div>
                </div>
                <div className="min-w-0">
                  <div className={cn("truncate text-sm font-medium", h.removed && "line-through")}>{h.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.days > 1
                      ? t(
                        "holidays.daysRange",
                        {
                          count: h.days,
                          end: new Date(`${h.endDate}T12:00:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" })
                        })
                      : d.toLocaleDateString(dateLocale(), { weekday: "long" })}
                    {h.halfDay && ` · ${t("holidays.halfDay")}`}
                    {h.kind === "COMPANY" && ` · ${t("holidays.companyDay")}`}
                  </div>
                </div>
                <span className="justify-self-start sm:justify-self-end">
                  {h.removed ? (
                    <span
                      className={"rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium " +
                        "text-muted-foreground"}>{t("holidays.notObserved")}</span>
                  ) : h.status === "ESTIMATED" ? (
                    <span
                      className={"rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium " +
                        "text-amber-700 dark:text-amber-300"}>{t("holidays.estimated")}</span>
                  ) : h.status === "CONFIRMED" ? (
                    <span
                      className={"rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium " +
                        "text-emerald-700 dark:text-emerald-300"}>{t("holidays.confirmed")}</span>
                  ) : null}
                </span>
                <span className="col-span-2 flex flex-wrap justify-end gap-1 sm:col-span-1">
                  {h.status === "ESTIMATED" && !h.removed && (
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => libraryChange(
                        h,
                        { confirmed: true })}><Check className="h-3.5 w-3.5" />{t("holidays.confirm")}</Button>
                  )}
                  {!h.removed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1"
                      onClick={() => setEdit({
                        row: h
                      })}><Pencil className="h-3.5 w-3.5" />{h.kind === "PUBLIC" ? t("holidays.move") : t("common.edit", "Edit")}</Button>
                  )}
                  {h.kind === "PUBLIC" && !h.removed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-muted-foreground"
                      onClick={() => libraryChange(h, { removed: true })}>{t("holidays.dontObserve")}</Button>
                  )}
                  {h.kind === "PUBLIC" && h.changed && h.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-muted-foreground"
                      onClick={() => remove.mutate(h.id!)}><RotateCcw className="h-3.5 w-3.5" />{t("holidays.restore")}</Button>
                  )}
                  {h.kind === "COMPANY" && h.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:text-destructive"
                      aria-label={t("holidays.delete")}
                      onClick={() => remove.mutate(h.id!)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

export function HolidayDialog({ open, row, onClose, onSave }: {
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
            <div
              className="space-y-1.5"><Label
                htmlFor="hol-date">{t(
                  "holidays.firstDay")}</Label><Input
                    id="hol-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  /></div>
            <div
              className="space-y-1.5"><Label
                htmlFor="hol-days">{t(
                  "holidays.lasts")}</Label><Input
                    id="hol-days"
                    type="number"
                    min={1}
                    max={14}
                    value={days}
                    onChange={(e) => setDays(Math.min(14, Math.max(1, Number(e.target.value) || 1)))}
                  /></div>
          </div>
          <div
            className="space-y-1.5"><Label
              htmlFor="hol-name">{t(
                "holidays.name")}</Label><Input id="hol-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
            <Label htmlFor="hol-half" className="font-normal">{t("holidays.halfDayLabel")}</Label>
            <Switch id="hol-half" checked={half} onCheckedChange={setHalf} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button
            disabled={!date || !name.trim()}
            onClick={() => onSave({
              date,
              days,
              name: name.trim(),
              halfDay: half,
              ...(row?.status === "ESTIMATED" ? { confirmed: true } : {})
            })}>{t("common.save", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
