"use client"

import { useTranslation } from "react-i18next"
import { PenSquare, Archive, ShieldCheck, EyeOff } from "lucide-react"
import { type DocumentTypeRow } from "@/lib/api"
import { typeConsequences } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/page/page-kit"
import { DirectionIcon } from "./direction-icon"

export function TypeRow({
  type,
  workflows,
  roles,
  onEdit,
  onRetire,
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
    <li className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-[13px] first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <DirectionIcon direction={type.direction} />
          <span className="text-[14.5px] font-semibold text-foreground">{type.label}</span>
          {type.isCredential && (
            <Chip tone="warn">
              <ShieldCheck className="h-3 w-3" />
              {t("documents.types.credential")}
            </Chip>
          )}
          {visibleTo.length > 0 && (
            <Chip>
              <EyeOff className="h-3 w-3" />
              {t("documents.types.visibleToBadge", {
                roles: visibleTo.map((r) => r.name).join(", "),
              })}
            </Chip>
          )}
          <code className="text-[11px] text-muted-foreground">{type.key}</code>
        </div>

        {/* Consequences, not flags. */}
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {typeConsequences(type)
            .map((c) => t(`documents.types.consequences.${c}`))
            .join(" · ")}
          {gated.length > 0 && ` · ${gated.map((w) => w.name).join(", ")}`}
        </p>
      </div>

      <div className="flex gap-1">
        <Button size="pill" variant="outline" className="h-8 px-3 text-[13px]" onClick={onEdit}>
          <PenSquare />
          {t("common.edit")}
        </Button>
        <Button
          size="pillIcon"
          variant="ghost"
          className="size-8"
          onClick={onRetire}
          aria-label={t("documents.types.retire")}
        >
          <Archive className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </li>
  )
}
