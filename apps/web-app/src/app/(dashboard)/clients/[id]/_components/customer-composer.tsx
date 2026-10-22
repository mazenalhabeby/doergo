"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Users, Loader2, CalendarClock, Plus, Bell, CheckSquare, Repeat } from "lucide-react"

import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { customersApi, type Customer } from "@/lib/api"
import { personName } from "@hbcfield/shared/client"
import { CreateTaskDialog } from "../../../../../components/tasks/create-task-dialog"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { COMPOSER, REMINDER_KINDS, REPEAT_OPTIONS, LEAD_OPTIONS } from "../_lib/customer-record-lib"
import { ChoiceChip } from "@/components/ui/choice-chip"

// ── Composer ────────────────────────────────────────────────────────────────
export function Composer({ customer, onAdded }: { customer: Customer; onAdded: () => void }) {
  const { t } = useTranslation()
  const customerId = customer.id
  const [type, setType] = useState<string>("NOTE")
  const [body, setBody] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [kind, setKind] = useState<string>("CALL")
  const [lead, setLead] = useState<number>(0)
  const [repeat, setRepeat] = useState<string>("NONE")
  const [assigneeId, setAssigneeId] = useState<string>("")
  const [focused, setFocused] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const isReminder = type === "REMINDER"

  // Assigned managers = who can be picked to receive a reminder.
  const { members: assignable } = useAssignableMembers({ spaceId: customer.spaceId, enabled: isReminder })
  const managers = assignable.filter((m) => (customer.managerIds ?? []).includes(m.id))

  const add = useMutation({
    mutationFn: () =>
      customersApi.addActivity(customerId, {
        type,
        body: body.trim() || undefined,
        dueAt: isReminder && dueAt ? new Date(dueAt).toISOString() : undefined,
        reminderKind: isReminder ? kind : undefined,
        remindBeforeMin: isReminder ? lead : undefined,
        reminderAssigneeId: isReminder ? assigneeId || null : undefined,
        repeat: isReminder ? repeat : undefined,
      }),
    onSuccess: () => {
      setBody("")
      setDueAt("")
      setRepeat("NONE")
      setAssigneeId("")
      setFocused(false)
      onAdded()
    },
    onError: (e: Error) => notify.error(e.message || "Could not add"),
  })

  const selectCls =
    "h-8 rounded-md border border-input bg-background px-2 text-xs " +
    "text-foreground focus-visible:outline-none focus-visible:ring-1 " +
    "focus-visible:ring-ring"

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-2.5 transition-shadow",
        focused || isReminder ? "border-primary/40 shadow-sm" : "border-border/70",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
          {COMPOSER.map((c) => (
            <button
              key={c.type}
              onClick={() => setType(c.type)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                type === c.type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <c.icon className="h-3.5 w-3.5" /> {t(`customers.act.${c.type.toLowerCase()}`, c.label)}
            </button>
          ))}
        </div>
        {customer.spaceId && (
          <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> {t("customers.newTask", "Task")}
          </Button>
        )}
      </div>
      <Textarea
        value={body}
        onFocus={() => setFocused(true)}
        onChange={(e) => setBody(e.target.value)}
        rows={focused || body || isReminder ? 3 : 1}
        className="resize-none border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
        placeholder={
          isReminder
            ? t("customers.reminderPlaceholder", "What to follow up on…")
            : t("customers.notePlaceholder", "Write a note…")
        }
      />

      {isReminder && (
        <div className="mt-1.5 space-y-2.5 rounded-xl bg-muted/40 p-2.5">
          {/* Reason / channel */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              {t("customers.reminderReason", "Reason")}
            </p>
            <div className="inline-flex flex-wrap gap-1">
              {REMINDER_KINDS.map((k) => (
                <ChoiceChip key={k.key} variant="iconPill" on={kind === k.key} onClick={() => setKind(k.key)}>
                  <k.icon className="h-3.5 w-3.5" /> {t(`customers.reminderKind.${k.key.toLowerCase()}`, k.label)}
                </ChoiceChip>
              ))}
            </div>
          </div>
          {/* When + lead + repeat + assignee */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="h-8 w-[13.5rem] text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <select value={lead} onChange={(e) => setLead(Number(e.target.value))} className={selectCls}>
                {LEAD_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {t(`customers.lead.${o.v}`, o.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={selectCls}>
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {t(`customers.repeat.${o.v.toLowerCase()}`, o.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectCls}>
                <option value="">{t("customers.allManagers", "All managers")}</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personName(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {assigneeId
              ? t("customers.reminderWhoOne", "Notifies the selected manager, everywhere.")
              : t("customers.reminderWho", "Notifies every manager assigned to this customer, everywhere.")}
          </p>
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-end gap-2 px-1.5">
        <Button size="sm" disabled={add.isPending || (isReminder ? !dueAt : !body.trim())} onClick={() => add.mutate()}>
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1 h-3.5 w-3.5" />{" "}
              {isReminder ? t("customers.setReminder", "Set reminder") : t("customers.log", "Add")}
            </>
          )}
        </Button>
      </div>

      {customer.spaceId && (
        <CreateTaskDialog
          open={taskOpen}
          onOpenChange={(o) => {
            setTaskOpen(o)
            if (!o) onAdded()
          }}
          defaultSpaceId={customer.spaceId}
          defaultCustomerId={customer.id}
        />
      )}
    </div>
  )
}

// A one-click "remind me in 3 days" used by the no-next-step nudge.
export function QuickRemind({ customerId, onAdded }: { customerId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const add = useMutation({
    mutationFn: () => {
      const d = new Date()
      d.setDate(d.getDate() + 3)
      d.setHours(9, 0, 0, 0)
      return customersApi.addActivity(customerId, {
        type: "REMINDER",
        reminderKind: "CALL",
        dueAt: d.toISOString(),
        remindBeforeMin: 0,
      })
    },
    onSuccess: onAdded,
    onError: (e: Error) => notify.error(e.message || "Could not add"),
  })
  return (
    <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate()}>
      {add.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Bell className="mr-1.5 h-3.5 w-3.5" /> {t("customers.remindIn3", "Remind in 3 days")}
        </>
      )}
    </Button>
  )
}
