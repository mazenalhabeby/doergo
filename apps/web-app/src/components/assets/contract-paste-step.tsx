"use client"

import { useTranslation } from "react-i18next"
import { Loader2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"

/** Step 1 of reading a contract: paste the agreement, then read it (or skip to filling it in by hand). */
export function ContractPasteStep({
  text,
  setText,
  reading,
  onRead,
  onSkip,
}: {
  text: string
  setText: (text: string) => void
  /** The reader is working on it. */
  reading: boolean
  onRead: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "contract.pasteHint",
          "Paste the agreement. It fills in what it can find and creates nothing until you say so.",
        )}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={t(
          "contract.pastePh",
          "Hersteller: Ford\nModell: Transit Custom\nAmtliches Kennzeichen: GM-472 " + "DK\nMietbeginn: 15.09.2026",
        )}
        className={
          "w-full rounded-xl border border-border bg-background p-3 font-mono " +
          "text-xs text-foreground outline-none focus:border-primary"
        }
      />
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onSkip}>
          {t("contract.skipRead", "Fill it in myself")}
        </Button>
        <Button disabled={!text.trim() || reading} onClick={onRead}>
          {reading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> {t("contract.read", "Read it")}
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
