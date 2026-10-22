"use client"

import { useTranslation } from "react-i18next"
import { Clock, LogIn, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ClockInPicker } from "@/components/attendance/clock-in-picker"

interface ClockGateDialogProps {
  open: boolean
  onClose: () => void
  pending: boolean
  onClockIn: () => void
  /** The workspace picker the clock-in may need — the same one the navbar clock uses. */
  pickerProps: React.ComponentProps<typeof ClockInPicker>
}

/**
 * "You're not clocked in" — the web half of the job-start rule. Presentation
 * only: `useClockGate` decides when it opens and repeats the move afterwards.
 */
export function ClockGateDialog({ open, onClose, pending, onClockIn, pickerProps }: ClockGateDialogProps) {
  const { t } = useTranslation()
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t("tasks.clockGate.title")}
            </DialogTitle>
            <DialogDescription>{t("tasks.clockGate.body")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={pending}>
              {t("tasks.clockGate.notNow")}
            </Button>
            <Button className="flex-1" onClick={onClockIn} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {t("tasks.clockGate.clockInAndStart")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ClockInPicker {...pickerProps} />
    </>
  )
}
