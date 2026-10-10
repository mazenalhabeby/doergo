"use client"

import { useTranslation } from "react-i18next"
import { personName, formatDuration } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The amber "something is owed" surface — the handover card and the reassign warning share it. */
export const HANDOVER_WARN_CLASS =
  "rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"


/**
 * "Mike hasn't written a handover yet — worked 2h 15m on it." One sentence, read
 * by the job's card AND the reassign dialog (task page and board), so they
 * always say the same. Null when nothing is owed.
 */
export function useHandoverPendingText(task: Pick<Task, "handoverDue"> | null | undefined): string | null {
  const { t } = useTranslation()
  const due = task?.handoverDue
  if (!due?.user) return null
  return due.workedMinutes
    ? t("tasks.handover.notYetWorked", { name: personName(due.user), time: formatDuration(due.workedMinutes) })
    : t("tasks.handover.notYet", { name: personName(due.user) })
}

/**
 * The reassign dialog's warning (packages/shared/src/tasks/handover.ts): wait
 * for the note, or give the job away anyway — with an optional note for the
 * new person, posted on the job once it is theirs.
 */
export function HandoverPendingNotice({
  text, onWait, note, onNoteChange,
}: {
  text: string
  onWait: () => void
  note: string
  onNoteChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-5 mb-3 space-y-3">
      <div className={`space-y-1 ${HANDOVER_WARN_CLASS}`}>
        <p className="font-medium">{text}</p>
        <p className="text-xs opacity-80">{t("tasks.handover.reassignHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reassign-note" className="text-xs">{t("tasks.handover.noteForNew")}</Label>
        <Input id="reassign-note" value={note} maxLength={500} onChange={(e) => onNoteChange(e.target.value)} placeholder={t("tasks.handover.noteForNewPlaceholder")} />
      </div>
      <Button size="sm" variant="outline" onClick={onWait}>{t("tasks.handover.wait")}</Button>
    </div>
  )
}
