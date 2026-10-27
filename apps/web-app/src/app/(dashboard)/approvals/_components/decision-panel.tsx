"use client"

import Link from "next/link"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Check, Loader2, X } from "lucide-react"
import {
  approvalActionsFor,
  approvalWebPath,
  durationInRange,
  APPROVAL_KIND_SPECS,
  type ApprovalActionSpec,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalText,
} from "@hbcfield/shared/client"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/common/user-avatar"
import { formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { FactRow } from "@/components/page/page-kit"
import { WhoElse } from "./who-else"
import { ViewFile } from "./view-file"
import { NoShowDecision } from "./no-show-decision"
import { DurationField } from "./duration-field"
import { nameParts } from "./name-parts"
import { ConfirmHint } from "./confirm-hint"
import { useTick } from "../_hooks/use-tick"
import { ruleLinkForItem } from "../_lib/rule-link"
import { initialDecisionMinutes, stepNoticeKey } from "../_lib/step-notice"
import { formatRequestMinutes } from "@/lib/requests"
import { DatesPassedTag } from "./dates-passed-tag"
import { Icon } from "@/components/ui/icon"

/**
 * One decision, made here.
 *
 * The buttons are the kind's own (shared `approvalActionsFor`): an item the
 * caller cannot decide, or one whose decision needs a form this panel does not
 * carry (an asset kind, a workspace for a job), shows only the way to its page.
 * Choosing an action that needs words or a number opens its field first; the
 * button that sends it is the same one, pressed again.
 */
export function DecisionPanel({
  item,
  text,
  busy,
  onDecide,
  onMakeRule,
}: {
  item: ApprovalItem
  text: ApprovalText
  busy: boolean
  onDecide: (d: ApprovalDecision) => void
  /** People who may set office rules: "make a rule like this" opens the rules page with one offered. */
  onMakeRule?: (link: string) => void
}) {
  const { t } = useTranslation()
  const actions = approvalActionsFor(item)
  const ruleLink = onMakeRule ? ruleLinkForItem(item) : null
  const initialMinutes = initialDecisionMinutes(item)
  const agreed = item.step?.agreedMinutes
  const [armed, setArmed] = useState<ApprovalActionSpec | null>(null)
  const [reason, setReason] = useState("")
  const [minutes, setMinutes] = useState<number | null>(30)
  const [expiresOn, setExpiresOn] = useState("")
  const hintId = useId()
  // "Raised … ago" moves on the same beat as the header's "Updated …".
  useTick()

  // A different item starts clean — a reason typed for one must never be sent for the next. Keyed on the item
  // alone: a running shift's facts are rebuilt on every refresh, and the form must not close under the typing.
  useEffect(() => {
    setArmed(null)
    setReason("")
  }, [item.kind, item.id])

  const needsForm = (a: ApprovalActionSpec) => a.reason !== "none" || !!a.input
  const reasonMissing = armed?.reason === "required" && !reason.trim()
  const minutesBad = armed?.input === "minutes" && !durationInRange(minutes)

  const send = (a: ApprovalActionSpec) => {
    if (needsForm(a) && armed?.id !== a.id) {
      // The item's own figures are read as the form opens (the duration field starts on them, keyed by the item).
      setMinutes(initialMinutes)
      setExpiresOn(typeof item.data.expiresOn === "string" ? String(item.data.expiresOn).slice(0, 10) : "")
      setArmed(a)
      return
    }
    if (reasonMissing || minutesBad) return
    onDecide({
      kind: item.kind,
      id: item.id,
      action: a.id,
      reason: a.reason !== "none" && reason.trim() ? reason.trim() : undefined,
      minutes: a.input === "minutes" ? minutes! : undefined,
      expiresOn: a.input === "expiresOn" && expiresOn ? expiresOn : undefined,
      spaceId:
        item.kind === "clientRequest"
          ? (item.space?.id ?? (item.data.suggestedSpaceId as string | undefined))
          : undefined,
    })
  }

  const spec = APPROVAL_KIND_SPECS[item.kind]
  const pageOnly = item.canDecide && actions.length === 0 && !!spec.needsPage?.(item)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          soft
          {...nameParts(item.subject.name)}
          avatarUrl={item.subject.avatarUrl}
          seed={item.subject.id ?? item.subject.name}
          size="lg"
        />
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-[17px] font-semibold text-foreground">
            {item.subject.name || t("approvals.someone")}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {t(`approvals.kinds.${item.kind}`)} · {text.headline}
          </p>
        </div>
      </div>

      <dl>
        {item.space && <FactRow label={t("approvals.fact.workspace")} value={item.space.name} />}
        {text.facts.map((f) => (
          <FactRow key={f.label} label={f.label} value={f.value} tone={f.tone === "bad" ? "crit" : f.tone} />
        ))}
        {item.raisedAt && <FactRow label={t("approvals.fact.raised")} value={formatTimeAgo(item.raisedAt)} />}
      </dl>

      <DatesPassedTag item={item} className="self-start" />

      <ViewFile item={item} />

      {item.step && (
        <p className="rounded-2xl bg-shell-accent-soft px-4 py-3 text-sm text-foreground">
          {t(stepNoticeKey(item.step), { name: item.step.firstByName, role: item.step.roleName })}
        </p>
      )}

      {onMakeRule && ruleLink && (
        <button
          type="button"
          onClick={() => onMakeRule(ruleLink)}
          className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-shell-accent hover:underline"
        >
          <Icon name="sparkles" size={15} />
          {t("approvals.tree.smart.makeRule")}
        </button>
      )}

      {/* A missed shift has its own answers (excused with a reason, absent, they were here). */}
      {item.kind === "noShow" && item.canDecide && <NoShowDecision item={item} busy={busy} onDecide={onDecide} />}

      {armed && (
        <div className="space-y-3">
          {/* An earlier approver agreed a time: the field starts on it, and the smaller of the two is what counts. */}
          {armed.input === "minutes" && typeof agreed === "number" && item.step && (
            <p className="text-[13px] text-muted-foreground">
              {t("approvals.step.agreed", {
                name: item.step.firstByName,
                time: formatRequestMinutes(agreed, (k, o) => t(k, o)),
              })}
            </p>
          )}
          {armed.input === "minutes" && (
            <DurationField
              key={`${item.kind}:${item.id}`}
              id="approval-minutes"
              initialMinutes={initialMinutes}
              invalid={minutesBad}
              onChange={setMinutes}
            />
          )}
          {armed.input === "expiresOn" && (
            <div className="space-y-1.5">
              <Label htmlFor="approval-expires">{t("approvals.expiresOn")}</Label>
              <DatePicker id="approval-expires" value={expiresOn} onChange={setExpiresOn} clearable className="w-44" />
            </div>
          )}
          {armed.reason !== "none" && (
            <div className="space-y-1.5">
              <Label htmlFor="approval-reason">
                {t(armed.reason === "required" ? "approvals.reasonRequired" : "approvals.reasonOptional")}
              </Label>
              <Textarea
                id="approval-reason"
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      {actions.length > 0 && item.kind !== "noShow" && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => {
            const isArmed = armed?.id === a.id
            const blocked = isArmed && (reasonMissing || minutesBad)
            return (
              <Button
                key={a.id}
                size="pillLg"
                variant={a.tone === "danger" ? (isArmed ? "destructive" : "outline") : "default"}
                // Not `disabled` while the form is incomplete: the button keeps the keyboard focus (send() refuses).
                disabled={busy}
                aria-disabled={blocked || undefined}
                // Armed: "press again" is read as its description, once the form it opened is complete.
                aria-describedby={isArmed && !blocked ? hintId : undefined}
                onClick={() => send(a)}
                className={cn(
                  a.tone === "danger" && !isArmed && "text-destructive hover:text-destructive",
                  blocked && "cursor-not-allowed opacity-50",
                )}
              >
                {busy && isArmed ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : a.id === "approve" ? (
                  <Check className="size-4" />
                ) : (
                  <X className="size-4" />
                )}
                {t(`approvals.actions.${a.labelKey}`)}
              </Button>
            )
          })}
          {armed && (
            <Button variant="ghost" size="pillLg" disabled={busy} onClick={() => setArmed(null)}>
              {t("common.cancel")}
            </Button>
          )}
          {/* Said only once pressing again would send it — not while the reason or the duration is still missing. */}
          <ConfirmHint id={hintId} asking={!!armed && !reasonMissing && !minutesBad} />
        </div>
      )}

      {pageOnly && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t(`approvals.needsPage.${item.kind}`)}
        </p>
      )}

      <div className="rounded-[14px] bg-muted p-3">
        <WhoElse item={item} />
      </div>

      {/* Decisions are made here; a page is offered only where this one cannot finish it. */}
      {pageOnly && (
        <Link
          href={approvalWebPath(item)}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline"
        >
          {t("approvals.openPage")}
          <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </div>
  )
}
