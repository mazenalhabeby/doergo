"use client"

import { useTranslation } from "react-i18next"
import { ExternalLink } from "lucide-react"
import { type LinkDocumentRow } from "@/lib/api"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

/** The two counts above the list: still to sign, already signed. */
export function Tabs({ toSign, signed }: { toSign: number; signed: number }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex gap-4 border-b border-border text-sm">
      <span className="border-b-2 border-primary pb-2 font-medium">
        {t("signLink.tabs.toSign", "To sign")} · {toSign}
      </span>
      <span className="pb-2 text-muted-foreground">
        {t("signLink.tabs.signed", "Signed")} · {signed}
      </span>
    </div>
  )
}

export function Row({
  doc,
  checked,
  onToggle,
  onOpen,
  readOnly,
}: {
  doc: LinkDocumentRow
  checked?: boolean
  onToggle?: () => void
  onOpen: () => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border p-3",
        checked && "border-primary/40 bg-primary/5",
      )}
    >
      {!readOnly && <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.title}</p>
        {doc.forMember && <p className="truncate text-xs text-muted-foreground">{doc.forMember}</p>}
        {doc.alreadySigned.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {t("signLink.row.signedBy", "Signed by")} {doc.alreadySigned.map((s) => s.name).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-xs text-primary">
          <ExternalLink className="h-3 w-3" />
          {t("signLink.row.open", "Open")}
        </button>
        {!readOnly && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px]",
              doc.openedAt
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
            )}
          >
            {doc.openedAt ? t("signLink.row.read", "Read") : t("signLink.row.unread", "Not opened")}
          </span>
        )}
      </div>
    </div>
  )
}
