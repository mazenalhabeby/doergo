"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Check, FileText, Loader2, X } from "lucide-react"
import {
  approvalActionsFor,
  approvalWebPath,
  APPROVAL_KIND_SPECS,
  type ApprovalActionSpec,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalText,
} from "@hbcfield/shared/client"

import { assetsApi, documentsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { formatDuration } from "@hbcfield/shared/client"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/common/user-avatar"
import { formatTimeAgo } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { WhoElse } from "./who-else"
import { NoShowDecision } from "./no-show-decision"
import { nameParts } from "./name-parts"

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
}: {
  item: ApprovalItem
  text: ApprovalText
  busy: boolean
  onDecide: (d: ApprovalDecision) => void
}) {
  const { t } = useTranslation()
  const actions = approvalActionsFor(item)
  const [armed, setArmed] = useState<ApprovalActionSpec | null>(null)
  const [reason, setReason] = useState("")
  const [minutes, setMinutes] = useState("30")
  const [expiresOn, setExpiresOn] = useState("")

  // A different item starts clean — a reason typed for one must never be sent for the next.
  useEffect(() => {
    setArmed(null)
    setReason("")
    setMinutes(String((item.data as Record<string, unknown>).requestedMinutes ?? 30))
    setExpiresOn(typeof item.data.expiresOn === "string" ? String(item.data.expiresOn).slice(0, 10) : "")
  }, [item.kind, item.id, item.data])

  const needsForm = (a: ApprovalActionSpec) => a.reason !== "none" || !!a.input
  const reasonMissing = armed?.reason === "required" && !reason.trim()
  const minutesValue = Number(minutes)
  const minutesBad =
    armed?.input === "minutes" && !(Number.isInteger(minutesValue) && minutesValue >= 1 && minutesValue <= 1440)

  const send = (a: ApprovalActionSpec) => {
    if (needsForm(a) && armed?.id !== a.id) {
      setArmed(a)
      return
    }
    if (reasonMissing || minutesBad) return
    onDecide({
      kind: item.kind,
      id: item.id,
      action: a.id,
      reason: a.reason !== "none" && reason.trim() ? reason.trim() : undefined,
      minutes: a.input === "minutes" ? minutesValue : undefined,
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
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <UserAvatar
          {...nameParts(item.subject.name)}
          avatarUrl={item.subject.avatarUrl}
          seed={item.subject.id ?? item.subject.name}
          size="lg"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(`approvals.kinds.${item.kind}`)}
          </p>
          <h2 className="truncate text-lg font-semibold text-foreground">
            {item.subject.name || t("approvals.someone")}
          </h2>
          <p className="text-sm text-muted-foreground">{text.headline}</p>
        </div>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
        {item.space && <Fact label={t("approvals.fact.workspace")} value={item.space.name} />}
        {text.facts.map((f) => (
          <Fact key={f.label} {...f} />
        ))}
        {item.raisedAt && <Fact label={t("approvals.fact.raised")} value={formatTimeAgo(item.raisedAt)} />}
      </dl>

      <ViewFile item={item} />

      {item.step && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {item.step.mine
            ? t("approvals.step.mine", { role: item.step.roleName })
            : t("approvals.step.waiting", { name: item.step.firstByName, role: item.step.roleName })}
        </p>
      )}

      {/* A missed shift has its own answers (excused with a reason, absent, they were here). */}
      {item.kind === "noShow" && item.canDecide && <NoShowDecision item={item} busy={busy} onDecide={onDecide} />}

      {armed && (
        <div className="space-y-3">
          {armed.input === "minutes" && (
            <div className="space-y-1.5">
              <Label htmlFor="approval-minutes">{t("approvals.minutes")}</Label>
              <Input
                id="approval-minutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-32"
              />
              {/* The number read as time (clock review C8): "90" is "1h 30m". */}
              {Number.isInteger(minutesValue) && minutesValue >= 60 && (
                <p className="text-xs text-muted-foreground">= {formatDuration(minutesValue)}</p>
              )}
            </div>
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
                variant={a.tone === "danger" ? (isArmed ? "destructive" : "outline") : "default"}
                disabled={busy || blocked}
                onClick={() => send(a)}
                className={cn(
                  "rounded-lg",
                  a.tone === "danger" && !isArmed && "text-destructive hover:text-destructive",
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
            <Button variant="ghost" className="rounded-lg" disabled={busy} onClick={() => setArmed(null)}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      )}

      {pageOnly && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {t(`approvals.needsPage.${item.kind}`)}
        </p>
      )}

      <div className="border-t border-border pt-4">
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

function Fact({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right font-medium text-foreground [overflow-wrap:anywhere]",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * The paper behind a decision — a document to verify, a receipt, a page sent in
 * to become an asset. Nobody verifies what they cannot see. The link is minted
 * on the tap (each kind's own POST, which is the "opened" record), never listed.
 */
function ViewFile({ item }: { item: ApprovalItem }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const mint =
    item.kind === "document"
      ? () => documentsApi.downloadUrl(item.id)
      : item.kind === "expense" && item.data.hasReceipt
        ? () => assetsApi.getReceiptUrl(item.id)
        : item.kind === "assetProposal"
          ? () => assetsApi.getProposalDocumentUrl(item.id)
          : null
  if (!mint) return null
  const open = async () => {
    // Opened before the await, or the browser treats the later window as a pop-up.
    const tab = window.open("", "_blank")
    setBusy(true)
    try {
      const res = await mint()
      if (res?.url && tab) tab.location.href = res.url
      else tab?.close()
    } catch (e) {
      tab?.close()
      notify.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" size="sm" className="self-start gap-2" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
      {t(`approvals.viewFile.${item.kind}`)}
    </Button>
  )
}
