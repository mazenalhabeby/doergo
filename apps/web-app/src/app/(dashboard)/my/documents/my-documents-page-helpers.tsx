"use client"

import { useTranslation } from "react-i18next"
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react"
import { cn } from "@/lib/utils"

/** MyDocumentsPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const MONTHS_KEY = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const

/*
  A credential's standing, as a colour and a word.

  Colour alone would fail anyone who cannot distinguish red from green, and on
  a screen this is the one row where the difference decides whether somebody can
  be sent to a job — so the word carries the meaning and the colour only speeds
  it up.
*/
export function StandingChip({ standing, expiresOn }: { standing: string; expiresOn: string | null }) {
  const { t } = useTranslation()
  const map: Record<string, { cls: string; Icon: typeof ShieldCheck; label: string }> = {
    VALID: { cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400", Icon: ShieldCheck, label: t("documents.standing.valid") },
    EXPIRING: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", Icon: ShieldAlert, label: t("documents.standing.expiring") },
    EXPIRED: { cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", Icon: ShieldX, label: t("documents.standing.expired") },
  }
  const v = map[standing]
  if (!v) return null
  const days = expiresOn
    ? Math.ceil((new Date(expiresOn).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", v.cls)}>
      <v.Icon className="h-3 w-3" />
      {standing === "EXPIRING" && days !== null
        ? t("documents.standing.inDays", { count: days })
        : v.label}
    </span>
  )
}
