"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

/** What the server keeps of a reason — `reviewNote` is sliced to this. */
export const REFUSE_NOTE_MAX = 300

/**
 * Refuse an expense, and say why.
 *
 * The API always took a note and the phone shows it to the member under the
 * refused entry — but the web refused with one tap and sent nothing, so a
 * driver whose fuel receipt was turned down saw "Refused" and no reason, and
 * the next conversation happened by phone. Asking costs one sentence; the
 * reason stays optional, because "duplicate" is sometimes all there is to say.
 *
 * Shared by the office queue and a record's Money tab, so both refuse the same
 * way.
 */
export function ExpenseRefuseDialog({
  trigger,
  pending,
  onRefuse,
}: {
  trigger: React.ReactNode
  pending?: boolean
  /** Called with the trimmed reason, or undefined when none was given. */
  onRefuse: (note: string | undefined) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")

  const change = (next: boolean) => {
    if (next) setNote("")
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("assetFacts.refuse.title", "Refuse this expense")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="expense-refuse-note">{t("assetFacts.refuse.why", "Why (the member sees this)")}</Label>
          <Textarea
            id="expense-refuse-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={REFUSE_NOTE_MAX}
            rows={3}
            autoFocus
            placeholder={t("assetFacts.refuse.whyPh", "e.g. Not a fuel receipt, wrong vehicle…")}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => change(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onRefuse(note.trim() || undefined)
              setOpen(false)
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("assetFacts.refuse.confirm", "Refuse")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
