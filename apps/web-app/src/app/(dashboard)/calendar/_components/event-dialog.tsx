"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  REMINDER_OFFSETS, parseQuickAdd, type Repeat, type RepeatFreq, type EventVisibility,
} from "@hbcfield/shared/client"
import { AlertTriangle, Bell, CalendarDays, Link2, Lock, MapPin, Repeat as RepeatIcon, Search, Sparkles, UserPlus, Video, X } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { calendarApi, type CalendarEventDetail, type CalendarEventInput, type CalendarPerson } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { dayKey } from "../_lib/layout"
import { offsetLabel } from "./item-popover"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Prefill a start (double-click on the grid). */
  start?: Date | null
  /** Edit an existing event. */
  event?: CalendarEventDetail | null
  spaceId?: string | null
}

const pad = (n: number) => String(n).padStart(2, "0")
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function at(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  return new Date(y!, m! - 1, d!, h ?? 0, mi ?? 0)
}
function roundUp(d: Date): Date {
  const x = new Date(d)
  x.setMinutes(Math.ceil((x.getMinutes() + 1) / 30) * 30, 0, 0)
  return x
}

const DURATIONS = [15, 30, 45, 60, 90, 120]

/** One form for an appointment or a reminder — type it as a sentence, or fill it in. */
export function EventDialog({ open, onOpenChange, start, event, spaceId }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const editing = !!event
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [smart, setSmart] = useState("")
  const [kind, setKind] = useState<"APPOINTMENT" | "REMINDER">("APPOINTMENT")
  const [title, setTitle] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [date, setDate] = useState(dayKey(new Date()))
  const [time, setTime] = useState("09:00")
  const [duration, setDuration] = useState(30)
  const [endDate, setEndDate] = useState(dayKey(new Date()))
  const [meetingUrl, setMeetingUrl] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [people, setPeople] = useState<CalendarPerson[]>([])
  const [reminders, setReminders] = useState<number[]>([10])
  const [freq, setFreq] = useState<RepeatFreq | "NONE">("NONE")
  const [visibility, setVisibility] = useState<EventVisibility>("BUSY")
  const [pickOpen, setPickOpen] = useState(false)
  const [q, setQ] = useState("")

  // Fill from the event being edited, or from where the grid was double-clicked.
  useEffect(() => {
    if (!open) return
    if (event) {
      const s = new Date(event.startAt), e = new Date(event.endAt)
      setKind(event.kind); setTitle(event.title); setAllDay(event.allDay)
      setDate(dayKey(s)); setTime(hm(s)); setDuration(Math.max(5, Math.round((e.getTime() - s.getTime()) / 60000)))
      setEndDate(dayKey(new Date(e.getTime() - 1))); setMeetingUrl(event.meetingUrl ?? ""); setLocation(event.location ?? "")
      setDescription(event.description ?? ""); setReminders(event.reminders); setFreq(event.repeat?.freq ?? "NONE")
      setVisibility(event.visibility)
      setPeople(event.attendees.filter((a) => !a.isOrganizer).map((a) => ({ id: a.userId, firstName: a.firstName, lastName: a.lastName, avatarUrl: a.avatarUrl })))
      setSmart("")
    } else {
      const s = start ?? roundUp(new Date())
      setKind("APPOINTMENT"); setTitle(""); setAllDay(false); setDate(dayKey(s)); setTime(hm(s)); setDuration(30)
      setEndDate(dayKey(s)); setMeetingUrl(""); setLocation(""); setDescription(""); setPeople([]); setReminders([10])
      setFreq("NONE"); setVisibility("BUSY"); setSmart("")
    }
  }, [open, event, start])

  // The sentence fills the fields as it is typed; every field stays editable.
  const parsed = useMemo(() => {
    if (!smart.trim()) return null
    const now = new Date()
    return parseQuickAdd(smart, dayKey(now), now.getHours() * 60 + now.getMinutes())
  }, [smart])
  useEffect(() => {
    if (!parsed) return
    setKind(parsed.kind)
    if (parsed.title) setTitle(parsed.title)
    if (parsed.date) { setDate(parsed.date); setEndDate(parsed.date) }
    if (parsed.time) { setTime(parsed.time); setAllDay(false) }
    if (parsed.durationMin) setDuration(parsed.durationMin)
  }, [parsed])

  const startAt = useMemo(() => at(date, time), [date, time])
  const endAt = useMemo(() => new Date(startAt.getTime() + duration * 60000), [startAt, duration])

  const { data: candidates = [] } = useQuery({
    queryKey: ["calendar-people", q],
    queryFn: () => calendarApi.people(q),
    enabled: pickOpen,
    staleTime: 60_000,
  })

  // Free/busy around the chosen time, for everyone invited.
  const windowFrom = useMemo(() => { const d = at(date, "07:00"); return d }, [date])
  const windowTo = useMemo(() => at(date, "19:00"), [date])
  const ids = people.map((p) => p.id)
  const { data: avail = [] } = useQuery({
    queryKey: ["calendar-availability", ids.join(","), windowFrom.toISOString()],
    queryFn: () => calendarApi.availability(ids, windowFrom.toISOString(), windowTo.toISOString()),
    enabled: open && ids.length > 0 && !allDay,
    staleTime: 30_000,
  })
  const clashes = useMemo(() => {
    if (allDay) return []
    return avail.filter((a) => {
      const day = a.days.find((d) => d.day === date)
      if (day && (day.leave || day.kind !== "work")) return true
      return a.busy.some((b) => new Date(b.start) < endAt && new Date(b.end) > startAt)
    }).filter((a) => ids.includes(a.userId))
  }, [avail, date, startAt, endAt, allDay, ids])

  const findTime = useMutation({
    mutationFn: () => calendarApi.freeSlots({ userIds: ids, durationMin: duration, from: new Date().toISOString(), days: 14, timezone: tz }),
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const save = useMutation({
    mutationFn: () => {
      const repeat: Repeat | null = freq === "NONE" ? null : event?.repeat?.freq === freq ? event.repeat : { freq, interval: 1 }
      const input: CalendarEventInput = {
        // An edit keeps the event's own zone; only a new event takes the browser's.
        kind, title: title.trim(), allDay, ...(editing ? {} : { timezone: tz }),
        ...(allDay ? { startDate: date, endDate: endDate < date ? date : endDate } : { startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
        meetingUrl: meetingUrl.trim() || null, location: location.trim() || null, description: description.trim() || null,
        reminders, repeat, visibility, attendeeIds: ids, spaceId: event ? undefined : spaceId ?? null,
      }
      return editing ? calendarApi.update(event!.id, input) : calendarApi.create(input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] })
      qc.invalidateQueries({ queryKey: ["calendar-event"] })
      toast.success(editing ? t("calendar.savedToast") : ids.length ? t("calendar.invitedToast", { count: ids.length }) : t("calendar.createdToast"))
      onOpenChange(false)
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const toggleReminder = (m: number) =>
    setReminders((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : cur.length >= 5 ? cur : [...cur, m].sort((a, b) => b - a)))

  const fmtTime = (iso: string) => new Date(iso).toLocaleString(dateLocale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 p-0 sm:min-w-[32rem]">
        <DialogHeader className="px-6 pb-0 pt-5">
          <DialogTitle className="text-lg tracking-tight">{editing ? t("calendar.editTitle") : t("calendar.newTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("calendar.newHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div role="tablist" className="inline-flex rounded-xl border bg-muted/40 p-1">
            {(["APPOINTMENT", "REMINDER"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition", kind === k && "bg-background text-foreground shadow-sm ring-1 ring-border")}
              >
                {k === "APPOINTMENT" ? <Video className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {t(k === "APPOINTMENT" ? "calendar.appointment" : "calendar.reminder")}
              </button>
            ))}
          </div>

          {!editing && (
            <div className="rounded-xl bg-gradient-to-r from-blue-500/70 via-violet-500/60 to-emerald-500/60 p-px">
              <div className="flex items-center gap-2.5 rounded-[11px] bg-background px-3">
                <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
                <input
                  id="cal-smart"
                  value={smart}
                  onChange={(e) => setSmart(e.target.value)}
                  placeholder={t("calendar.smartPlaceholder")}
                  className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
                  autoFocus
                />
              </div>
            </div>
          )}
          {parsed && parsed.parts.length > 0 && (
            <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {t("calendar.readAs")}
              {parsed.parts.map((p, i) => (
                <span key={i} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">{p.text}</span>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cal-title">{t("calendar.titleLabel")}</Label>
            <Input id="cal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder={t("calendar.titlePlaceholder")} />
          </div>

          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="cal-allday" className="flex items-center gap-2 font-normal"><CalendarDays className="h-4 w-4 text-muted-foreground" />{t("calendar.allDay")}</Label>
            <Switch id="cal-allday" checked={allDay} onCheckedChange={setAllDay} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cal-date">{allDay ? t("calendar.from") : t("calendar.date")}</Label>
              <Input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {allDay ? (
              <div className="space-y-1.5">
                <Label htmlFor="cal-end">{t("calendar.to")}</Label>
                <Input id="cal-end" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cal-time">{t("calendar.time")}</Label>
                  <Input id="cal-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5 sm:col-span-1">
                  <Label htmlFor="cal-dur">{t("calendar.duration")}</Label>
                  <select
                    id="cal-dur"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>{offsetLabel(m, t)}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {kind === "APPOINTMENT" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cal-link" className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />{t("calendar.meetingLink")}</Label>
                <Input id="cal-link" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://zoom.us/j/…" inputMode="url" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-where" className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{t("calendar.where")}</Label>
                <Input id="cal-where" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
              </div>
            </div>
          )}

          {/* Invite */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("calendar.invite")}</span>
              {ids.length > 0 && !allDay && (
                <button type="button" onClick={() => findTime.mutate()} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Search className="h-3.5 w-3.5" />{t("calendar.findTime")}
                </button>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border">
              {people.map((p) => {
                const a = avail.find((x) => x.userId === p.id)
                const day = a?.days.find((d) => d.day === date)
                const off = !!day && (!!day.leave || day.kind !== "work")
                const busy = a?.busy.some((b) => new Date(b.start) < endAt && new Date(b.end) > startAt)
                const span = windowTo.getTime() - windowFrom.getTime()
                const pos = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - windowFrom.getTime()) / span) * 100))
                return (
                  <div key={p.id} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{p.firstName[0]}{p.lastName[0]}</span>
                      <div className="min-w-0">
                        <div className="truncate text-sm">{p.firstName} {p.lastName}</div>
                        <div className={cn("text-[11px]", off ? "text-amber-600 dark:text-amber-400" : busy ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                          {!a || allDay ? " " : day?.leave ? t("calendar.onLeave") : off ? t("calendar.dayOff") : busy ? t("calendar.busy") : t("calendar.free")}
                        </div>
                      </div>
                    </div>
                    <div className="relative h-5 rounded-md bg-[repeating-linear-gradient(90deg,hsl(var(--border))_0_1px,transparent_1px_8.33%)]" aria-hidden>
                      {off && <i className="absolute inset-y-0.5 left-0 right-0 rounded bg-[repeating-linear-gradient(-45deg,rgba(245,158,11,.35)_0_4px,transparent_4px_8px)]" />}
                      {!off && a?.busy.map((b, i) => (
                        <i key={i} className="absolute inset-y-1 rounded bg-muted-foreground/30" style={{ left: `${pos(new Date(b.start))}%`, width: `${Math.max(1, pos(new Date(b.end)) - pos(new Date(b.start)))}%` }} />
                      ))}
                      {!allDay && <i className="absolute -inset-y-1 rounded border-2 border-violet-500 bg-violet-500/15" style={{ left: `${pos(startAt)}%`, width: `${Math.max(1.5, pos(endAt) - pos(startAt))}%` }} />}
                    </div>
                    <button type="button" aria-label={t("calendar.remove")} onClick={() => setPeople((c) => c.filter((x) => x.id !== p.id))} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
              <Popover open={pickOpen} onOpenChange={setPickOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50">
                    <UserPlus className="h-4 w-4" />{t("calendar.addPeople")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput value={q} onValueChange={setQ} placeholder={t("calendar.searchPeople")} />
                    <CommandList>
                      <CommandEmpty>{t("calendar.noPeople")}</CommandEmpty>
                      <CommandGroup>
                        {candidates.filter((c) => !ids.includes(c.id)).map((c) => (
                          <CommandItem key={c.id} value={c.id} onSelect={() => { setPeople((cur) => [...cur, c]); setQ("") }}>
                            <span className="truncate">{c.firstName} {c.lastName}</span>
                            {c.position && <span className="ml-auto truncate text-xs text-muted-foreground">{c.position}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {ids.length > 0 && !allDay && (
              <div className="flex justify-between px-1 font-mono text-[10px] text-muted-foreground/70" aria-hidden>
                {["07", "10", "13", "16", "19"].map((h) => <span key={h}>{h}:00</span>)}
              </div>
            )}
          </div>

          {(clashes.length > 0 || findTime.data) && (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {clashes.length > 0 && <p>{t("calendar.clash", { names: clashes.map((c) => c.firstName).join(", ") })}</p>}
                {!findTime.data && clashes.length > 0 && (
                  <button type="button" onClick={() => findTime.mutate()} className="mt-1 text-xs font-semibold underline-offset-2 hover:underline">{t("calendar.findTime")}</button>
                )}
                {findTime.data && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {findTime.data.length === 0 && <span className="text-xs">{t("calendar.noSlots")}</span>}
                    {findTime.data.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        onClick={() => { const d = new Date(s.start); setDate(dayKey(d)); setTime(hm(d)) }}
                        className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                      >
                        {fmtTime(s.start)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("calendar.remind")}</span>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_OFFSETS.filter((m) => [0, 10, 30, 60, 1440].includes(m) || reminders.includes(m)).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={reminders.includes(m)}
                    onClick={() => toggleReminder(m)}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition", reminders.includes(m) ? "border-primary/50 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}
                  >
                    {reminders.includes(m) && <Bell className="h-3 w-3" />}{offsetLabel(m, t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("calendar.repeatAndPrivacy")}</span>
              <div className="flex flex-wrap gap-1.5">
                <label className="relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                  <RepeatIcon className="h-3 w-3" />
                  <select aria-label={t("calendar.repeat")} value={freq} onChange={(e) => setFreq(e.target.value as RepeatFreq | "NONE")} className="bg-transparent outline-none">
                    {(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const).map((f) => <option key={f} value={f}>{t(`calendar.repeatFreq.${f}`)}</option>)}
                  </select>
                </label>
                {(["BUSY", "DETAILS"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={visibility === v}
                    onClick={() => setVisibility(v)}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition", visibility === v ? "border-primary/50 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}
                  >
                    {v === "BUSY" && <Lock className="h-3 w-3" />}{t(v === "BUSY" ? "calendar.showBusy" : "calendar.showDetails")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cal-notes">{t("calendar.notes")}</Label>
            <Textarea id="cal-notes" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-muted/20 px-6 py-3 sm:justify-between">
          <span className="hidden text-xs text-muted-foreground sm:block">{ids.length ? t("calendar.inviteeNote") : " "}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}>
              {editing ? t("calendar.save") : ids.length ? t("calendar.saveAndInvite") : t("calendar.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
