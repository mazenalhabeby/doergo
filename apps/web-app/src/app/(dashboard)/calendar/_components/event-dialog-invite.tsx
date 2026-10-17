"use client"

import { personName, personInitials } from "@hbcfield/shared/client"
import { Search, UserPlus, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import type { EventDialogState } from "./use-event-dialog"

/** Part of EventDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function EventDialogInvite({ vm }: { vm: EventDialogState }) {
  const {
    t,
    ids,
    allDay,
    findTime,
    people,
    avail,
    date,
    endAt,
    startAt,
    windowTo,
    windowFrom,
    setPeople,
    pickOpen,
    setPickOpen,
    q,
    setQ,
    candidates,
  } = vm
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("calendar.invite")}</span>
        {ids.length > 0 && !allDay && (
          <button
            type="button"
            onClick={() => findTime.mutate()}
            className={"inline-flex items-center gap-1 text-xs font-medium text-primary " + "hover:underline"}>
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
                <span
                  className={"grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 " +
                    "text-[10px] font-semibold text-primary"}>{personInitials(p)}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm">{personName(p)}</div>
                  <div
                    className={cn(
                      "text-[11px]",
                      off ? "text-amber-600 dark:text-amber-400" : busy ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                    {!a || allDay
                      ? " "
                      : day?.leave ? t("calendar.onLeave") : off ? t("calendar.dayOff") : busy ? t("calendar.busy") : t("calendar.free")}
                  </div>
                </div>
              </div>
              <div
                className={"relative h-5 rounded-md " +
                  "bg-[repeating-linear-gradient(90deg,hsl(var(--border))_0_1px,transparent_1px_8.33%)]"}
                aria-hidden>
                {off &&
                  <i
                    className={"absolute inset-y-0.5 left-0 right-0 rounded " +
                      "bg-[repeating-linear-gradient(-45deg,rgba(245,158,11,.35)_0_4px,transparent_4px_8px)]"}
                  />}
                {!off && a?.busy.map((b, i) => (
                  <i
                    key={i}
                    className="absolute inset-y-1 rounded bg-muted-foreground/30"
                    style={{ left: `${pos(new Date(b.start))}%`, width: `${Math.max(1, pos(new Date(b.end)) - pos(new Date(b.start)))}%` }}
                  />
                ))}
                {!allDay &&
                  <i
                    className="absolute -inset-y-1 rounded border-2 border-violet-500 bg-violet-500/15"
                    style={{ left: `${pos(startAt)}%`, width: `${Math.max(1.5, pos(endAt) - pos(startAt))}%` }}
                  />}
              </div>
              <button
                type="button"
                aria-label={t("calendar.remove")}
                onClick={() => setPeople((c) => c.filter((x) => x.id !== p.id))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
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
                      <span className="truncate">{personName(c)}</span>
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
  )
}
