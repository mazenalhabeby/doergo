"use client"

import { useTranslation } from "react-i18next"
import { Download, FileText, Save, Pencil, CalendarClock, ChevronDown, Table2 } from "lucide-react"
import { type DatasetMeta } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/page/page-kit"
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[26px] font-semibold tracking-[-0.03em] text-foreground">{active.name}</h2>
          <Chip>
            {isDetail
              ? t("reports.badgeTimesheet", "Timesheet")
              : active.builder
                ? t("reports.badgeCustom", "Custom")
                : active.savedId
                  ? t("reports.badgeSaved", "Saved")
                  : t("reports.badgeTemplate", "Template")}
          </Chip>
        </div>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {(isDetail
            ? [rangeLabel]
            : [dsMeta && reportLabel(lang, dsMeta.labelKey, dsMeta.label), rangeLabel, customerFilter]
          )
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {!isDetail && canBuild && !active.builder && (
          <Button variant="ghost" size="pill" onClick={onCustomize}>
            <Pencil className="h-3.5 w-3.5" />
            {t("reports.customize", "Customize")}
          </Button>
        )}
        {!isDetail && canBuild && (
          <Button data-tour="reports-save" variant="outline" size="pill" onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            {active.savedId
              ? t("reports.updateTemplate", "Update template")
              : t("reports.saveTemplate", "Save as template")}
          </Button>
        )}
        {!isDetail && canSchedule && active.savedId && (
          <Button variant="outline" size="pill" onClick={onSchedule}>
            <CalendarClock className="h-3.5 w-3.5" />
            {t("reports.schedule", "Schedule")}
          </Button>
        )}
        {hasRows && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-tour="reports-export" variant="outline" size="pill">
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
