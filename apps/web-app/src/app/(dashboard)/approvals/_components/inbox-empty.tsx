"use client"

import { useTranslation } from "react-i18next"
import { Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * The list with nothing in it. Narrowed to one kind (a "?kind=…" link, or the last one of a kind just decided),
 * it says that kind is empty and offers the rest — "Nothing waiting for you" would be untrue while other kinds wait.
 */
export function InboxEmpty({ narrowed, onShowAll }: { narrowed: boolean; onShowAll: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="px-6 py-16 text-center">
      <Inbox className="mx-auto mb-3 size-10 text-muted-foreground/60" />
      <p className="font-medium text-foreground">{t(narrowed ? "approvals.emptyKind" : "approvals.empty")}</p>
      {narrowed ? (
        <Button variant="outline" size="pill" className="mt-3" onClick={onShowAll}>
          {t("approvals.showAll")}
        </Button>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("approvals.emptyHint")}</p>
      )}
    </div>
  )
}
