"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  personName,
  personInitials,
  MEETING_PROVIDER_NAMES, REMINDER_OFFSETS, cleanPhone, meetingProvider, spanMinutes, spanProblem, moveEndWithStart, durationText,
  type CallDirection, type MeetingMode, type PlaceKind, type Repeat, type RepeatFreq, type EventVisibility,
} from "@hbcfield/shared/client"
import { AlertTriangle, Bell, Briefcase, Building2, CalendarDays, Link2, Lock, MapPin, Palmtree, Phone, Repeat as RepeatIcon, Search, UserPlus, Users, Video, X } from "lucide-react"
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
import { calendarApi, customersApi, type CalendarEventDetail, type CalendarEventInput, type CalendarPerson } from "@/lib/api"
import { useClientAddresses } from "@/hooks/use-client-addresses"
import { serverErrorMessage } from "@/lib/server-error"
import { dayKey } from "../_lib/layout"
import { offsetLabel } from "./item-popover"
import { useEventDialog, hm, at, type Props } from "./use-event-dialog"
import { EventDialogClient } from "./event-dialog-client"
import { EventDialogInvite } from "./event-dialog-invite"

/** One form for an appointment or a reminder: a start and an end, the duration follows. */
export function EventDialog({ open, onOpenChange, start, event, spaceId, offices = [], crm = false, onNewJob, onTimeOff }: Props) {
  const vm = useEventDialog({ open, onOpenChange, start, event, spaceId, offices, crm, onNewJob, onTimeOff })
  const {
    t,
    editing,
    kind,
    setKind,
    title,
    setTitle,
    allDay,
    setAllDay,
    date,
    setDate,
    time,
    endDate,
    setEndDate,
    endTime,
    setEndTime,
    meetingUrl,
    setMeetingUrl,
    location,
    setLocation,
    description,
    setDescription,
    people,
    setPeople,
    reminders,
    freq,
    setFreq,
    visibility,
    setVisibility,
    pickOpen,
    setPickOpen,
    q,
    setQ,
    mode,
    setMode,
    place,
    setPlace,
    placeSpaceId,
    setPlaceSpaceId,
    room,
    setRoom,
    phone,
    setPhone,
    callDirection,
    setCallDirection,
    customer,
    setCustomer,
    clientQ,
    setClientQ,
    clientOpen,
    setClientOpen,
    addressId,
    setAddressId,
    clientPage,
    clientAddresses,
    provider,
    phoneOk,
    startAt,
    endAt,
    duration,
    problem,
    setStart,
    candidates,
    windowFrom,
    windowTo,
    ids,
    avail,
    clashes,
    findTime,
    save,
    toggleReminder,
    fmtTime,
  } = vm

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
                {k === "APPOINTMENT" ? <Users className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {t(k === "APPOINTMENT" ? "calendar.appointment" : "calendar.reminder")}
              </button>
            ))}
            {/* The two that already have their own forms open those, filled with this moment. */}
            {!editing && onTimeOff && (
              <button type="button" onClick={() => { onOpenChange(false); onTimeOff(date) }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                <Palmtree className="h-4 w-4" />{t("calendar.kindTimeOff")}
              </button>
            )}
            {!editing && onNewJob && (
              <button type="button" onClick={() => { onOpenChange(false); onNewJob(allDay ? at(date, "00:00") : startAt) }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                <Briefcase className="h-4 w-4" />{t("calendar.kindJob")}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cal-title">{t("calendar.titleLabel")}</Label>
            <Input id="cal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder={t("calendar.titlePlaceholder")} />
          </div>

          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="cal-allday" className="flex items-center gap-2 font-normal"><CalendarDays className="h-4 w-4 text-muted-foreground" />{t("calendar.allDay")}</Label>
            <Switch id="cal-allday" checked={allDay} onCheckedChange={setAllDay} />
          </div>

          {allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cal-date">{t("calendar.from")}</Label>
                <Input id="cal-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-end">{t("calendar.to")}</Label>
                <Input id="cal-end" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[4.5rem_1fr_7rem] items-center gap-2">
                <Label htmlFor="cal-date">{t("calendar.starts")}</Label>
                <Input id="cal-date" type="date" value={date} onChange={(e) => setStart(e.target.value, time)} />
                <Input id="cal-time" aria-label={t("calendar.time")} type="time" step={300} value={time} onChange={(e) => setStart(date, e.target.value)} />
              </div>
              <div className="grid grid-cols-[4.5rem_1fr_7rem] items-center gap-2">
                <Label htmlFor="cal-end-date">{t("calendar.ends")}</Label>
                <Input id="cal-end-date" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
                <Input id="cal-end-time" aria-label={t("calendar.time")} type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <p className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")} role={problem ? "alert" : undefined}>
                {problem === "END_BEFORE_START" ? t("calendar.endBeforeStart") : problem === "TOO_LONG" ? t("calendar.tooLong", { days: 14 }) : t("calendar.durationAuto", { value: durationText(duration, (k, o) => t(k, o)) })}
              </p>
            </div>
          )}

          <EventDialogClient vm={vm} crm={crm} offices={offices} />

          {/* Invite */}
          <EventDialogInvite vm={vm} />

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
                        onClick={() => { const d = new Date(s.start); setStart(dayKey(d), hm(d)) }}
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
            <Button disabled={!title.trim() || !!problem || save.isPending || (kind === "APPOINTMENT" && mode === "PHONE" && !phoneOk) || (kind === "APPOINTMENT" && mode === "IN_PERSON" && place === "CLIENT_SITE" && (!customer || !location.trim()))} onClick={() => save.mutate()}>
              {editing ? t("calendar.save") : ids.length ? t("calendar.saveAndInvite") : t("calendar.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
