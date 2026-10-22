"use client"

import Link from "next/link"
import { Lock } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import type { DenyReason } from "@/lib/route-access"

/**
 * A page this person may not use, said plainly — instead of its shell drawn
 * around requests that all come back refused.
 *
 * Rendered by the dashboard layout IN PLACE of the page, so the page never
 * mounts and none of its queries are sent.
 */
export function NoPageAccess({ reason }: { reason: DenyReason }) {
  const { t } = useTranslation()
  const body = reason === "option" || reason === "module"
    ? t("common.noPageAccessOption")
    : t("common.noPageAccessBody")
  return (
    <div data-testid="no-page-access" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{t("common.noPageAccessTitle")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link href="/dashboard">{t("common.backToHome")}</Link>
      </Button>
    </div>
  )
}
