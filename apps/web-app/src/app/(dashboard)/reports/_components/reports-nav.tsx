"use client"

import { useTranslation } from "react-i18next"
import { BarChart3, Clock, SlidersHorizontal, Trash2 } from "lucide-react"
import { type SavedReport } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { ActiveReport } from "../_hooks/use-report-builder"

function NavBtn({
  activeKey,
  onClick,
  icon: Icon,
  label,
  desc,
  onDelete,
  dataTour,
}: {
  activeKey: boolean
  onClick: () => void
  icon: typeof Clock
  label: string
  desc?: string
  onDelete?: () => void
  dataTour?: string
}) {
  return (
    <div
      data-tour={dataTour}
      className={cn(
        "group/nav w-full rounded-xl border px-2.5 py-2.5 transition-all " + "cursor-pointer flex items-start gap-2.5",
        activeKey ? "border-primary/50 bg-primary/[0.05] shadow-sm" : "border-transparent hover:bg-accent/50",
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "grid place-items-center h-8 w-8 rounded-lg shrink-0 transition-colors",
          activeKey
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover/nav:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm font-medium text-foreground truncate">{label}</div>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{desc}</p>}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className={
            "opacity-0 group-hover/nav:opacity-100 text-muted-foreground " + "hover:text-red-600 shrink-0 pt-0.5"
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

type ReportsNavProps = {
  active: ActiveReport | null
  saved: SavedReport[] | undefined
  canBuild: boolean
  onNew: () => void
  onPick: (r: SavedReport) => void
  onDelete: (id: string) => void
}

/** The left column: the report builder, then the organization's saved templates. */
export function ReportsNav({ active, saved, canBuild, onNew, onPick, onDelete }: ReportsNavProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <NavBtn
          dataTour="reports-builder"
          activeKey={!!active?.builder}
          onClick={onNew}
          icon={SlidersHorizontal}
          label={t("reports.builderNav", "Report builder")}
          desc={t("reports.builderNavDesc", "Pick a dataset, measures and grouping")}
        />
      </div>
      {saved && saved.length > 0 && (
        <div data-tour="reports-saved-list">
          <p className={"text-[11px] font-semibold uppercase tracking-wider text-muted-foreground " + "mb-2 px-1"}>
            {t("reports.myTemplates", "My templates")}
          </p>
          <div className="space-y-1">
            {saved.map((r) => (
              <NavBtn
                key={r.id}
                activeKey={active?.savedId === r.id}
                onClick={() => onPick(r)}
                icon={BarChart3}
                label={r.name}
                desc={r.description || undefined}
                onDelete={canBuild ? () => onDelete(r.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      {canBuild && (!saved || saved.length === 0) && (
        <p className="text-[11px] text-muted-foreground px-1 leading-snug">
          {t("reports.templatesHint", "Build a report, then “Save as template” to reuse it here.")}
        </p>
      )}
    </div>
  )
}
