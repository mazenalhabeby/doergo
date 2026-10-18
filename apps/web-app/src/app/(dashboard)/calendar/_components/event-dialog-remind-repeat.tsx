"use client"

import { REMINDER_OFFSETS, type RepeatFreq } from "@hbcfield/shared/client"
import { Bell, Lock, Repeat as RepeatIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { offsetLabel } from "./item-popover"
import type { EventDialogState } from "./use-event-dialog"

/** Part of EventDialog's markup (reminders, repeat and privacy), moved here unchanged; it reads the state from `vm`. */
export function EventDialogRemindRepeat({ vm }: { vm: EventDialogState }) {
  const { t, reminders, toggleReminder, freq, setFreq, visibility, setVisibility } = vm
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar.remind")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_OFFSETS.filter((m) => [0, 10, 30, 60, 1440].includes(m) || reminders.includes(m)).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={reminders.includes(m)}
              onClick={() => toggleReminder(m)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " + "transition",
                reminders.includes(m)
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {reminders.includes(m) && <Bell className="h-3 w-3" />}
              {offsetLabel(m, t)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar.repeatAndPrivacy")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <label className="relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            <RepeatIcon className="h-3 w-3" />
            <select
              aria-label={t("calendar.repeat")}
              value={freq}
              onChange={(e) => setFreq(e.target.value as RepeatFreq | "NONE")}
              className="bg-transparent outline-none"
            >
              {(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`calendar.repeatFreq.${f}`)}
                </option>
              ))}
            </select>
          </label>
          {(["BUSY", "DETAILS"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visibility === v}
              onClick={() => setVisibility(v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " + "transition",
                visibility === v
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {v === "BUSY" && <Lock className="h-3 w-3" />}
              {t(v === "BUSY" ? "calendar.showBusy" : "calendar.showDetails")}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
