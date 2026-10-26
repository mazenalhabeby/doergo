"use client"

import { useTranslation } from "react-i18next"
import { BarChart3, Clock, SlidersHorizontal, Trash2 } from "lucide-react"
import { type SavedReport } from "@/lib/api"
import { cn } from "@/lib/utils"
import { GroupLabel, Panel } from "@/components/page/page-kit"
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
        "group/nav flex w-full cursor-pointer items-start gap-3 rounded-[14px] p-2.5 transition-colors",
        activeKey ? "bg-shell-nav-on" : "hover:bg-accent",
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[10px] transition-colors",
          activeKey
            ? "bg-shell-accent-soft text-shell-accent"
            : "bg-shell-chip text-muted-foreground group-hover/nav:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className={cn("truncate text-sm text-foreground", activeKey ? "font-semibold" : "font-medium")}>
          {label}
        </div>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{desc}</p>}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className={
            "opacity-0 group-hover/nav:opacity-100 text-muted-foreground " + "hover:text-destructive shrink-0 pt-0.5"
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
    <Panel as="nav" className="flex flex-col gap-3 self-start">
      <div className="flex flex-col gap-0.5">
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
          <GroupLabel className="pt-1">{t("reports.myTemplates", "My templates")}</GroupLabel>
          <div className="flex flex-col gap-0.5">
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
        <p className="px-3 pb-2 text-xs leading-snug text-muted-foreground">
          {t("reports.templatesHint", "Build a report, then “Save as template” to reuse it here.")}
        </p>
      )}
    </Panel>
  )
}
