"use client"

import { useTranslation } from "react-i18next"
import { PenSquare, Archive, ShieldCheck, EyeOff } from "lucide-react"
import { type DocumentTypeRow } from "@/lib/api"
import { typeConsequences } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { DirectionIcon } from "./direction-icon"

export function TypeRow({
  type, workflows, roles, onEdit, onRetire,
}: {
  type: DocumentTypeRow
  workflows: { id: string; name: string }[]
  roles: { id: string; name: string }[]
  onEdit: () => void
  onRetire: () => void
}) {
  const { t } = useTranslation()
  const gated = workflows.filter((w) => type.requiredForWorkflowIds.includes(w.id))
  // Restriction is worth saying on the row: it decides who sees a whole shelf
  // of the register, and it is invisible to the person it hides things from.
  const visibleTo = roles.filter((r) => type.visibleToRoleIds.includes(r.id))

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <DirectionIcon direction={type.direction} />
          <span className="font-medium text-slate-900 dark:text-slate-100">{type.label}</span>
          {type.isCredential && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <ShieldCheck className="h-3 w-3" />
              {t("documents.types.credential")}
            </span>
          )}
          {visibleTo.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <EyeOff className="h-3 w-3" />
              {t("documents.types.visibleToBadge", {
                roles: visibleTo.map((r) => r.name).join(", "),
              })}
            </span>
          )}
          <code className="text-[11px] text-slate-400">{type.key}</code>
        </div>

        {/* Consequences, not flags. */}
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {typeConsequences(type)
            .map((c) => t(`documents.types.consequences.${c}`))
            .join(" · ")}
          {gated.length > 0 && ` · ${gated.map((w) => w.name).join(", ")}`}
        </p>
      </div>

      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={t("common.edit")}>
          <PenSquare className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onRetire} aria-label={t("documents.types.retire")}>
          <Archive className="h-4 w-4 text-slate-400" />
        </Button>
      </div>
    </li>
  )
}
