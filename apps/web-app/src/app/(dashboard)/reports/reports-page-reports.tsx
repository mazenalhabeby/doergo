"use client"

import Link from "next/link"
import { CHART_COLORS } from "./_components/chart-colors"
import {
  Timer,
  BarChart3,
  Download,
  FileText,
  Save,
  Pencil,
  Lock,
  CalendarClock,
  ChevronDown,
  Table2,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { reportLabel } from "@hbcfield/shared/client"
import { fmt } from "./use-reports-page"
import { ReportBarChart, statCards } from "./reports-page-helpers"
import { ReportsPageDataset } from "./reports-page-dataset"
import type { ReportsPageState } from "./use-reports-page"
import { ReportsTableCard } from "./reports-table-card"

/** Part of ReportsPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ReportsPageReports({ vm }: { vm: ReportsPageState }) {
  const {
    t,
    NavBtn,
    active,
    newReport,
    saved,
    pickSaved,
    canBuild,
    del,
    isDetail,
    rangeLabel,
    dsMeta,
    lang,
    customerFilter,
    setActive,
    openSave,
    canSchedule,
    setSchedOpen,
    displayResult,
    download,
    setPdfOpen,
    chartMeasure,
    labelCol,
    chartData,
  } = vm
  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Page Header — matches the app's standard page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 data-tour="reports-header" className="text-3xl font-bold text-foreground tracking-tight">
            {t("reports.title", "Reports")}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            {t("reports.subtitle", "Run reports on your team, jobs, tasks and customers.")}
          </p>
        </div>
        {/* Job time — travel, working, blocked per job, beside the time on the clock. */}
        <Button asChild variant="outline">
          <Link href="/reports/job-time">
            <Timer className="h-4 w-4" /> {t("tasks.jobTime.reportTitle")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: report modes + saved */}
        <div className="space-y-5">
          <div className="space-y-1">
            <NavBtn
              dataTour="reports-builder"
              activeKey={!!active?.builder}
              onClick={newReport}
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
                    onClick={() => pickSaved(r)}
                    icon={BarChart3}
                    label={r.name}
                    desc={r.description || undefined}
                    onDelete={canBuild ? () => del.mutate(r.id) : undefined}
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

        {/* Right: builder/runner + results */}
        <div className="space-y-4">
          {!active ? (
            <div
              className={
                "rounded-2xl border border-border bg-card shadow-sm dark:shadow-none " +
                "dark:border-white/[0.08] p-16 text-center"
              }
            >
              <div
                className={"grid place-items-center h-12 w-12 rounded-2xl bg-primary/10 text-primary " + "mx-auto mb-4"}
              >
                <BarChart3 className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold text-foreground">
                {t("reports.pickOneTitle", "No report selected")}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                {t("reports.pickOne", "Pick a report on the left, or build a custom one.")}
              </p>
            </div>
          ) : (
            <>
              {/* ── Report header: identity + meta-actions ──────────────────── */}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-9"
                      onClick={() => setActive((a) => (a ? { ...a, builder: true } : a))}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("reports.customize", "Customize")}
                    </Button>
                  )}
                  {!isDetail && canBuild && (
                    <Button
                      data-tour="reports-save"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-9"
                      onClick={openSave}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {active.savedId
                        ? t("reports.updateTemplate", "Update template")
                        : t("reports.saveTemplate", "Save as template")}
                    </Button>
                  )}
                  {!isDetail && canSchedule && active.savedId && (
                    <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => setSchedOpen(true)}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      {t("reports.schedule", "Schedule")}
                    </Button>
                  )}
                  {displayResult && displayResult.rows.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-tour="reports-export" variant="outline" size="sm" className="gap-1.5 h-9">
                          <Download className="h-3.5 w-3.5" />
                          {t("reports.export", "Export")}
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={download} className="gap-2">
                          <Table2 className="h-4 w-4" />
                          {t("reports.exportCsv", "Download CSV")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPdfOpen(true)} className="gap-2">
                          <FileText className="h-4 w-4" />
                          {t("reports.exportPdfMenu", "Export PDF…")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {/* ── Configure & run ─────────────────────────────────────────── */}
              <ReportsPageDataset s={vm} />

              {!canBuild && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  {t("reports.builderLocked", "Custom report builder is available on Professional and above.")}
                </p>
              )}

              {/* ── Results ─────────────────────────────────────────────────── */}
              {displayResult &&
                (displayResult.rows.length === 0 ? (
                  <div
                    className={
                      "rounded-2xl border border-border bg-card shadow-sm dark:shadow-none " +
                      "dark:border-white/[0.08] p-14 text-center"
                    }
                  >
                    <div className="grid place-items-center h-10 w-10 rounded-xl bg-muted mx-auto mb-3">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t("reports.noData", "No data for this period.")}</p>
                  </div>
                ) : (
                  <div data-tour="reports-results" className="space-y-5">
                    {/* KPI stat cards */}
                    {statCards(displayResult).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                        {statCards(displayResult).map((s, i) => (
                          <div
                            key={i}
                            className={
                              "rounded-2xl border border-border bg-card shadow-sm dark:shadow-none " +
                              "dark:border-white/[0.08] p-4"
                            }
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                              />
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                                {s.label}
                              </p>
                            </div>
                            <p className="text-2xl font-bold tabular-nums text-foreground mt-1.5">{s.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Chart card (hidden for the day-by-day timesheet) */}
                    {!isDetail && chartMeasure && labelCol && chartData.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-foreground">
                            {t("reports.topBy", "Top {{measure}}", { measure: chartMeasure.label })}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {t("reports.topN", "Top {{n}}", { n: chartData.length })}
                          </span>
                        </div>
                        <ReportBarChart
                          data={chartData}
                          measureLabel={chartMeasure.label}
                          format={(v) => fmt(v, chartMeasure.format)}
                        />
                      </div>
                    )}

                    <ReportsTableCard vm={vm} />
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
