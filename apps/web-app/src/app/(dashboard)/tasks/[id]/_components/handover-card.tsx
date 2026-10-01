"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, PauseCircle, Play, PenLine } from "lucide-react"
import { HANDOVER_NOTE_MAX, formatDuration, owesHandover } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserAvatar } from "@/components/user-avatar"
import { formatTimeAgo } from "@/lib/format-date"

const WARN = "rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"

type PauseFacts = Pick<Task, "pausedAt" | "pausedById" | "handoverDueById" | "pausedBy" | "handoverDue" | "handovers">
const nameOf = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : "")

/**
 * "Mike hasn't written a handover yet — worked 2h 15m on it." One sentence, read
 * by the job's card AND the reassign dialog, so the two always say the same.
 */
export function useHandoverPendingText(task: PauseFacts | null | undefined): string | null {
  const { t } = useTranslation()
  const due = task?.handoverDue
  if (!due?.user) return null
  return due.workedMinutes
    ? t("tasks.handover.notYetWorked", { name: nameOf(due.user), time: formatDuration(due.workedMinutes) })
    : t("tasks.handover.notYet", { name: nameOf(due.user) })
}

/**
 * The top of a job somebody stopped (packages/shared/src/tasks/handover.ts):
 * paused, by whom and since when; "no handover yet"; and the newest note —
 * who wrote it, how long they worked, what they did and what is left — so
 * whoever picks the job up starts where it was left. Nothing on a job nobody
 * has stopped.
 */
export function HandoverCard({
  task,
  meId,
  canResume,
  resuming,
  onResume,
  onWrite,
}: {
  task: PauseFacts
  meId: string | null | undefined
  /** On the job: the one who stopped, or whoever has it now. */
  canResume: boolean
  resuming: boolean
  onResume: () => void
  onWrite: (note: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [writing, setWriting] = useState(false)
  const pending = useHandoverPendingText(task)
  const latest = task.handovers?.[0] ?? null
  const iOwe = owesHandover(task, meId)
  if (!task.pausedAt && !latest && !pending) return null

  return (
    <div className="space-y-2">
      {task.pausedAt ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
          <PauseCircle className="size-4 text-muted-foreground" />
          <span className="flex-1 text-foreground">
            {task.pausedById === meId
              ? t("tasks.handover.pausedYou", { when: formatTimeAgo(task.pausedAt) })
              : t("tasks.handover.pausedBy", { name: nameOf(task.pausedBy), when: formatTimeAgo(task.pausedAt) })}
          </span>
          {canResume ? (
            <Button size="sm" onClick={onResume} disabled={resuming}>
              {resuming ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {task.pausedById && task.pausedById !== meId ? t("tasks.handover.startWork") : t("tasks.handover.resume")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {iOwe ? (
        <div className={`flex flex-wrap items-center gap-3 ${WARN}`}>
          <span className="flex-1">{t("tasks.handover.youOwe")}</span>
          <Button size="sm" variant="outline" onClick={() => setWriting(true)}>
            <PenLine className="size-4" /> {t("tasks.handover.write")}
          </Button>
        </div>
      ) : pending ? (
        <div className={WARN}>{pending}</div>
      ) : null}

      {latest ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("tasks.handover.label")}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <UserAvatar firstName={latest.author.firstName} lastName={latest.author.lastName} avatarUrl={latest.author.avatarUrl} seed={latest.author.id} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{nameOf(latest.author)}</p>
              <p className="text-xs text-muted-foreground">
                {[formatTimeAgo(latest.createdAt), latest.workedMinutes ? t("tasks.handover.worked", { time: formatDuration(latest.workedMinutes) }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{latest.note}</p>
          {latest.attachmentIds.length ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("tasks.handover.photos", { count: latest.attachmentIds.length })}</p>
          ) : null}
        </div>
      ) : null}

      <HandoverDialog open={writing} onOpenChange={setWriting} onSave={onWrite} />
    </div>
  )
}

/** "What you did, and what is left" — the web's way to write the note. */
function HandoverDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (note: string) => Promise<unknown> }) {
  const { t } = useTranslation()
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await onSave(note.trim())
      setNote("")
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tasks.handover.title")}</DialogTitle>
          <DialogDescription>{t("tasks.handover.why")}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={HANDOVER_NOTE_MAX}
          rows={6}
          autoFocus
          placeholder={t("tasks.handover.placeholder")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={() => void save()} disabled={!note.trim() || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("tasks.handover.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The reassign dialog's warning: wait for the note, or give the job away anyway. */
export function HandoverPendingNotice({ text, onWait }: { text: string; onWait: () => void }) {
  const { t } = useTranslation()
  return (
    <div className={`mx-5 mb-3 space-y-2 ${WARN}`}>
      <p>{text}</p>
      <p className="text-xs opacity-80">{t("tasks.handover.reassignHint")}</p>
      <Button size="sm" variant="outline" onClick={onWait}>{t("tasks.handover.wait")}</Button>
    </div>
  )
}
