"use client"

import { useTranslation } from "react-i18next"
import { Download, FileText, Save, Pencil, CalendarClock, ChevronDown, Table2 } from "lucide-react"
import { type DatasetMeta } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { reportLabel } from "@hbcfield/shared/client"
import type { ActiveReport } from "../_hooks/use-report-builder"

type ReportHeaderProps = {
  active: ActiveReport
  isDetail: boolean
  dsMeta: DatasetMeta | undefined
  rangeLabel: string | undefined
  customerFilter: string | undefined
  canBuild: boolean
  canSchedule: boolean
  hasRows: boolean
  onCustomize: () => void
  onSave: () => void
  onSchedule: () => void
  onDownloadCsv: () => void
  onExportPdf: () => void
}

/** The report's name, what kind it is, what it covers — and customize, save, schedule, export. */
export function ReportHeader({
  active,
  isDetail,
  dsMeta,
  rangeLabel,
  customerFilter,
  canBuild,
  canSchedule,
  hasRows,
  onCustomize,
  onSave,
  onSchedule,
  onDownloadCsv,
  onExportPdf,
}: ReportHeaderProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground truncate">{active.name}</h2>
          <Badge variant="secondary" className="shrink-0 font-normal">
            {isDetail
              ? t("reports.badgeTimesheet", "Timesheet")
              : active.builder
                ? t("reports.badgeCustom", "Custom")
                : active.savedId
                  ? t("reports.badgeSaved", "Saved")
                  : t("reports.badgeTemplate", "Template")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {(isDetail
            ? [rangeLabel]
            : [dsMeta && reportLabel(lang, dsMeta.labelKey, dsMeta.label), rangeLabel, customerFilter]
          )
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isDetail && canBuild && !active.builder && (
          <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={onCustomize}>
            <Pencil className="h-3.5 w-3.5" />
            {t("reports.customize", "Customize")}
          </Button>
        )}
        {!isDetail && canBuild && (
          <Button data-tour="reports-save" variant="outline" size="sm" className="gap-1.5 h-9" onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            {active.savedId
              ? t("reports.updateTemplate", "Update template")
              : t("reports.saveTemplate", "Save as template")}
          </Button>
        )}
        {!isDetail && canSchedule && active.savedId && (
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={onSchedule}>
            <CalendarClock className="h-3.5 w-3.5" />
            {t("reports.schedule", "Schedule")}
          </Button>
        )}
        {hasRows && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-tour="reports-export" variant="outline" size="sm" className="gap-1.5 h-9">
                <Download className="h-3.5 w-3.5" />
                {t("reports.export", "Export")}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDownloadCsv} className="gap-2">
                <Table2 className="h-4 w-4" />
                {t("reports.exportCsv", "Download CSV")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPdf} className="gap-2">
                <FileText className="h-4 w-4" />
                {t("reports.exportPdfMenu", "Export PDF…")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
