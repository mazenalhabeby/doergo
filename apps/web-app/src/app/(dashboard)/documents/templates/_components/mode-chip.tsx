"use client"

import { useTranslation } from "react-i18next"
import { PenLine, CheckCheck, Printer, Ban } from "lucide-react"
import { Chip } from "@/components/page/page-kit"

export function ModeChip({ mode }: { mode: string }) {
  const { t } = useTranslation()
  const map: Record<string, { tone: "accent" | "soft" | "warn"; Icon: typeof PenLine }> = {
    IN_APP: { tone: "accent", Icon: PenLine },
    ACKNOWLEDGE: { tone: "soft", Icon: CheckCheck },
    // Amber, not red: not a fault, a legal fact about the document.
    WET_INK: { tone: "warn", Icon: Printer },
    NONE: { tone: "soft", Icon: Ban },
  }
  const v = map[mode] ?? map.NONE!
  return (
    <Chip tone={v.tone}>
      <v.Icon className="h-3 w-3" />
      {t(`documents.templates.modes.${mode.toLowerCase()}`)}
    </Chip>
  )
}
