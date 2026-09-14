"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Coffee, Pencil, Trash2, Loader2, BellRing, BellOff } from "lucide-react"

import { notify } from "@/lib/toast"
import { attendanceApi, type BreakRuleRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { SectionHeader, EmptyState } from "./section-header"

/**
 * The rests a workspace expects.
 *
 * This is the configuration half of the rest engine: what is planned, how long,
 * whether it is paid, and whether the member is asked. The other half — what one
 * person was actually asked to do today — is frozen onto their time entry at
 * clock-in and shown on their own shift page.
 *
 * A workspace with no rules here behaves exactly as this product did before
 * rests existed: breaks are taken when the member decides, and nothing prompts.
 */
export function RestsSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<BreakRuleRow | "new" | null>(null)

  const { data: rules, isLoading } = useQuery({
    queryKey: ["break-rules", spaceId],
    queryFn: () => attendanceApi.listBreakRules({ spaceId }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => attendanceApi.deleteBreakRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["break-rules", spaceId] })
      notify.success(t("attendance.rests.removed", "Rest removed"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const active = (rules ?? []).filter((r) => r.isActive)

  return (
    <div>
      <SectionHeader
        icon={Coffee}
        title={t("attendance.rests.title", "Rests")}
        description={t(
          "attendance.rests.subtitle",
          "Planned for everyone working here. Members are asked when one falls due, and an unpaid rest comes off their counted hours.",
        )}
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("attendance.rests.add", "Add a rest")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : active.length === 0 ? (
        <EmptyState
          icon={Coffee}
          title={t("attendance.rests.emptyTitle", "No rests planned")}
          description={t(
            "attendance.rests.emptyBody",
            "Nobody is prompted and nothing is deducted. Add one to have the day plan itself.",
          )}
        />
      ) : (
        <ul className="space-y-2">
          {active.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{rule.name}</span>
                  <Badge variant={rule.isPaid ? "secondary" : "outline"} className="text-[10px]">
                    {rule.isPaid
                      ? t("attendance.rests.paid", "Counts as work")
                      : t("attendance.rests.unpaid", "Doesn't count")}
                  </Badge>
                  {rule.isRequired && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("attendance.rests.required", "Required")}
                    </Badge>
                  )}
                  {rule.remind ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <BellRing className="h-3 w-3" />
                      {t("attendance.rests.remindEvery", "asks again every {{n}}m", { n: rule.snoozeMin })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <BellOff className="h-3 w-3" />
                      {t("attendance.rests.noReminder", "no reminder")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rule.trigger === "AFTER_WORKED"
                    ? t("attendance.rests.afterSummary", "{{mins}} minutes, after {{after}} of the shift", {
                        mins: rule.durationMinutes,
                        after:
                          (rule.afterMinutes ?? 0) >= 60
                            ? `${Math.floor((rule.afterMinutes ?? 0) / 60)}h${(rule.afterMinutes ?? 0) % 60 ? ` ${(rule.afterMinutes ?? 0) % 60}m` : ""}`
                            : `${rule.afterMinutes ?? 0}m`,
                      })
                    : t("attendance.rests.windowSummary", "{{mins}} minutes, any time between {{from}} and {{to}}", {
                        mins: rule.durationMinutes,
                        from: rule.earliestLocal ?? "—",
                        to: rule.latestLocal ?? t("attendance.rests.shiftEnd", "the end of the shift"),
                      })}
                </p>
              </div>

              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(rule)} aria-label={t("common.edit")}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(rule.id)}
                  disabled={remove.isPending}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RestDialog
          spaceId={spaceId}
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function RestDialog({
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
      return rule
        ? attendanceApi.updateBreakRule(rule.id, payload)
        : attendanceApi.createBreakRule(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["break-rules", spaceId] })
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
            {t("attendance.rests.dialogHint", "Everyone working in this workspace is planned this rest, unless a shift says otherwise.")}
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
              hint={t("attendance.rests.paidHint", "A rest that doesn't count as work comes off the counted hours. The statutory break usually doesn't count.")}
              checked={isPaid}
              onChange={setIsPaid}
            />
            <ToggleRow
              label={t("attendance.rests.requiredLabel", "Required")}
              hint={t("attendance.rests.requiredHint", "A required rest that is not taken flags the entry for review. Nothing is ever deducted for it.")}
              checked={isRequired}
              onChange={setIsRequired}
            />
            <ToggleRow
              label={t("attendance.rests.remindLabel", "Remind the member")}
              hint={t("attendance.rests.remindHint", "Asks when it falls due, and again if they say later — three times, then it stops and records it as not taken.")}
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
