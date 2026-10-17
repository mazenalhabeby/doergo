"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, CalendarPlus, Loader2 } from "lucide-react"
import {
  NO_SHOW_EXCUSE_REASONS,
  noShowAttendancePrefill,
  type ApprovalDecision,
  type ApprovalItem,
  type NoShowExcuseReason,
} from "@hbcfield/shared/client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { keys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"

const AddAttendanceDialog = dynamic(
  () => import("../../members/[id]/_components/add-attendance-dialog").then((m) => m.AddAttendanceDialog),
  { ssr: false },
)

type Choice = "excuse" | "absent"

/**
 * A missed shift, decided with an answer that CLOSES it (shared attendance/no-show.ts):
 * excused — with what happened — or absent, a real missed day. "They were here"
 * adds the hours instead, and the no-show closes itself when they are saved.
 *
 * A run of misses (the same shift, day after day) is decided at once by default;
 * the server finds the run itself. A long run usually means the rota is wrong,
 * so the way to the rota is offered beside it.
 */
export function NoShowDecision({
  item,
  busy,
  onDecide,
}: {
  item: ApprovalItem
  busy: boolean
  onDecide: (d: ApprovalDecision) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const run = typeof item.data.runCount === "number" ? item.data.runCount : 0
  const [choice, setChoice] = useState<Choice | null>(null)
  const [reasonCode, setReasonCode] = useState<NoShowExcuseReason>("SICK")
  const [note, setNote] = useState("")
  const [wholeRun, setWholeRun] = useState(true)

  // A different item starts clean.
  useEffect(() => {
    setChoice(null)
    setReasonCode("SICK")
    setNote("")
    setWholeRun(true)
  }, [item.kind, item.id])

  const prefill = noShowAttendancePrefill(item.data)
  const spaceId = item.space?.id

  const save = () => {
    if (!choice) return
    onDecide({
      kind: "noShow",
      id: item.id,
      action: choice === "excuse" ? "approve" : "reject",
      reasonCode: choice === "excuse" ? reasonCode : undefined,
      reason: note.trim() || undefined,
      wholeRun: run > 1 && wholeRun ? true : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">{t("approvals.noShow.whatHappened")}</p>

      <ChoiceCard
        selected={choice === "excuse"}
        onSelect={() => setChoice("excuse")}
        title={t("approvals.actions.excuse")}
        help={t("approvals.noShow.excusedHelp")}
      >
        {choice === "excuse" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {NO_SHOW_EXCUSE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReasonCode(r)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  reasonCode === r ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
                )}
              >
                {t(`approvals.noShow.reasons.${r}`)}
              </button>
            ))}
          </div>
        )}
      </ChoiceCard>

      <ChoiceCard
        selected={choice === "absent"}
        onSelect={() => setChoice("absent")}
        title={t("approvals.actions.absent")}
        help={t("approvals.noShow.absentHelp")}
      />

      {prefill && (
        <AddAttendanceDialog
          employeeId={prefill.userId}
          employeeName={item.subject.name}
          prefill={prefill}
          onAdded={() => qc.invalidateQueries({ queryKey: keys.approvals.all() })}
          trigger={
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <CalendarPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-sm font-medium text-foreground">{t("approvals.noShow.wasHere")}</span>
                <span className="block text-xs text-muted-foreground">{t("approvals.noShow.wasHereHelp")}</span>
              </span>
            </button>
          }
        />
      )}

      {choice && (
        <div className="space-y-1.5">
          <Label htmlFor="noshow-note">{t("approvals.reasonOptional")}</Label>
          <Textarea id="noshow-note" value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      {run > 1 && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox id="noshow-run" checked={wholeRun} onCheckedChange={(v) => setWholeRun(v === true)} />
          {t("approvals.noShow.wholeRun", { count: run })}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="rounded-lg" disabled={!choice || busy} onClick={save}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("approvals.noShow.save")}
        </Button>
        {run > 1 && spaceId && (
          <Link
            href={`/locations/${encodeURIComponent(spaceId)}?tab=attendance`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("approvals.noShow.fixRota")}
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  help,
  children,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  help: string
  children?: ReactNode
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        ("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 " +
          "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-ring"),
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {selected && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1" onClick={(e) => selected && e.stopPropagation()}>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
        {children}
      </span>
    </div>
  )
}
