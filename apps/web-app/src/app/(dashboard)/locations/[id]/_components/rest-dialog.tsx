"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { attendanceApi, type BreakRuleRow } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** Add or edit one planned rest: when it falls (a time window, or after so many hours), how long, and its reminders. */
export function RestDialog({
  spaceId,
  rule,
  onClose,
}: {
  spaceId: string
  rule: BreakRuleRow | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const [name, setName] = useState(rule?.name ?? "")
  const [trigger, setTrigger] = useState<"LOCAL_WINDOW" | "AFTER_WORKED">(rule?.trigger ?? "LOCAL_WINDOW")
  const [earliest, setEarliest] = useState(rule?.earliestLocal ?? "12:00")
  const [latest, setLatest] = useState(rule?.latestLocal ?? "")
  const [afterHours, setAfterHours] = useState(String(Math.floor((rule?.afterMinutes ?? 300) / 60)))
  const [duration, setDuration] = useState(String(rule?.durationMinutes ?? 30))
  const [isPaid, setIsPaid] = useState(rule?.isPaid ?? false)
  const [isRequired, setIsRequired] = useState(rule?.isRequired ?? true)
  const [remind, setRemind] = useState(rule?.remind ?? true)
  const [snoozeMin, setSnoozeMin] = useState(String(rule?.snoozeMin ?? 15))

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        spaceId,
        name: name.trim() || t("attendance.rests.defaultName", "Rest"),
        trigger,
        afterMinutes: trigger === "AFTER_WORKED" ? Math.round(Number(afterHours) * 60) : undefined,
        earliestLocal: trigger === "LOCAL_WINDOW" ? earliest : undefined,
        latestLocal: trigger === "LOCAL_WINDOW" && latest ? latest : undefined,
        durationMinutes: Number(duration),
        isPaid,
        isRequired,
        remind,
        snoozeMin: Number(snoozeMin),
      }
      return rule ? attendanceApi.updateBreakRule(rule.id, payload) : attendanceApi.createBreakRule(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.schedules.breakRules(spaceId) })
      notify.success(rule ? t("attendance.rests.updated", "Rest updated") : t("attendance.rests.added", "Rest added"))
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rule ? t("attendance.rests.editTitle", "Edit rest") : t("attendance.rests.newTitle", "New rest")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "attendance.rests.dialogHint",
              "Everyone working in this workspace is planned this rest, unless a shift says otherwise.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rest-name">{t("attendance.rests.name", "Name")}</Label>
            <Input
              id="rest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("attendance.rests.namePlaceholder", "Lunch")}
              maxLength={60}
            />
          </div>

          {/* When it falls due — two ways of saying it, one at a time. */}
          <div className="space-y-2">
            <Label>{t("attendance.rests.when", "When it falls due")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["LOCAL_WINDOW", "AFTER_WORKED"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTrigger(mode)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    trigger === mode
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40",
                  )}
                >
                  <span className="block font-medium">
                    {mode === "LOCAL_WINDOW"
                      ? t("attendance.rests.atATime", "At a time of day")
                      : t("attendance.rests.afterWorking", "After working a while")}
                  </span>
                  <span className="mt-0.5 block leading-snug">
                    {mode === "LOCAL_WINDOW"
                      ? t("attendance.rests.atATimeHint", "“around midday”")
                      : t("attendance.rests.afterWorkingHint", "“after five hours”")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {trigger === "LOCAL_WINDOW" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rest-from">{t("attendance.rests.dueAt", "Due at")}</Label>
                <Input id="rest-from" type="time" value={earliest} onChange={(e) => setEarliest(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rest-to">{t("attendance.rests.latestBy", "Too late after")}</Label>
                <Input id="rest-to" type="time" value={latest} onChange={(e) => setLatest(e.target.value)} />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t("attendance.rests.latestHint", "Optional. After this it is recorded as not taken.")}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="rest-after">{t("attendance.rests.afterHours", "Hours into the shift")}</Label>
              <Input
                id="rest-after"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={afterHours}
                onChange={(e) => setAfterHours(e.target.value)}
                className="w-32 tabular-nums"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rest-duration">{t("attendance.rests.duration", "How long (minutes)")}</Label>
              <Input
                id="rest-duration"
                type="number"
                min={1}
                max={480}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-32 tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rest-snooze">{t("attendance.rests.snooze", "Ask again after (minutes)")}</Label>
              <Input
                id="rest-snooze"
                type="number"
                min={5}
                max={120}
                value={snoozeMin}
                onChange={(e) => setSnoozeMin(e.target.value)}
                disabled={!remind}
                className="w-32 tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <ToggleRow
              label={t("attendance.rests.paidLabel", "Counts as work")}
              hint={t(
                "attendance.rests.paidHint",
                "A rest that doesn't count as work comes off the counted hours. The " +
                  "statutory break usually doesn't count.",
              )}
              checked={isPaid}
              onChange={setIsPaid}
            />
            <ToggleRow
              label={t("attendance.rests.requiredLabel", "Required")}
              hint={t(
                "attendance.rests.requiredHint",
                "A required rest that is not taken flags the entry for review. Nothing is " + "ever deducted for it.",
              )}
              checked={isRequired}
              onChange={setIsRequired}
            />
            <ToggleRow
              label={t("attendance.rests.remindLabel", "Remind the member")}
              hint={t(
                "attendance.rests.remindHint",
                "Asks when it falls due, and again if they say later — three times, then " +
                  "it stops and records it as not taken.",
              )}
              checked={remind}
              onChange={setRemind}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {rule ? t("common.save", "Save") : t("attendance.rests.create", "Add rest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}
