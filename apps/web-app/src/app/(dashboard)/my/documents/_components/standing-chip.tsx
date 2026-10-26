"use client"

import { useTranslation } from "react-i18next"
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react"
import { Chip } from "@/components/page/page-kit"

/*
  A credential's standing, as a colour and a word.

  Colour alone would fail anyone who cannot distinguish red from green, and on
  a screen this is the one row where the difference decides whether somebody can
  be sent to a job — so the word carries the meaning and the colour only speeds
  it up.
*/
export function StandingChip({ standing, expiresOn }: { standing: string; expiresOn: string | null }) {
  const { t } = useTranslation()
  const map: Record<string, { tone: "accent" | "warn" | "crit"; Icon: typeof ShieldCheck; label: string }> = {
    VALID: {
      tone: "accent" as const,
      Icon: ShieldCheck,
      label: t("documents.standing.valid"),
    },
    EXPIRING: {
      tone: "warn" as const,
      Icon: ShieldAlert,
      label: t("documents.standing.expiring"),
    },
    EXPIRED: {
      tone: "crit" as const,
      Icon: ShieldX,
      label: t("documents.standing.expired"),
    },
  }
  const v = map[standing]
  if (!v) return null
  const days = expiresOn ? Math.ceil((new Date(expiresOn).getTime() - Date.now()) / 86_400_000) : null

  return (
    <Chip tone={v.tone}>
      <v.Icon className="h-3 w-3" />
      {standing === "EXPIRING" && days !== null ? t("documents.standing.inDays", { count: days }) : v.label}
    </Chip>
  )
}
