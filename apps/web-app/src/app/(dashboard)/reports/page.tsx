"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Timer, BarChart3, Lock } from "lucide-react"
import { type ReportBranding } from "@/lib/report-pdf-options"
import { ReportExportStudio } from "@/components/reports/report-export-studio"
import { Button } from "@/components/ui/button"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { useReportBuilder } from "./_hooks/use-report-builder"
import { useReportResult } from "./_hooks/use-report-result"
import { ReportsNav } from "./_components/reports-nav"
import { ReportHeader } from "./_components/report-header"
import { ReportConfig } from "./_components/report-config"
import { ReportResults } from "./_components/report-results"
import { SaveTemplateDialog, type SaveMeta } from "./_components/save-template-dialog"
import { ScheduleDialog } from "./_components/schedule-dialog"

export default function ReportsPage() {
  const { t } = useTranslation()
  const builder = useReportBuilder()
  const { active, setActive, canBuild, canSchedule, isDetail } = builder
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveMeta, setSaveMeta] = useState<SaveMeta>({ name: "", description: "", isShared: true })
  const [schedOpen, setSchedOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  // Letterhead from what this reader may read (the profile is ADMIN-only) — hooks/use-org-letterhead.
  const { data: orgProfile } = useOrgLetterhead()
  const { displayResult, rangeLabel, pdfMeta, download } = useReportResult(builder)

  const openSave = () => {
    setSaveMeta({ name: active?.savedId ? active.name : "", description: "", isShared: true })
    setSaveOpen(true)
  }

  return (
    <div className="min-h-full bg-background">
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
          <ReportsNav
            active={active}
            saved={builder.saved}
            canBuild={canBuild}
            onNew={builder.newReport}
            onPick={builder.pickSaved}
            onDelete={(id) => builder.del.mutate(id)}
          />

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
                  className={
                    "grid place-items-center h-12 w-12 rounded-2xl bg-primary/10 text-primary " + "mx-auto mb-4"
                  }
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
                <ReportHeader
                  active={active}
                  isDetail={isDetail}
                  dsMeta={builder.dsMeta}
                  rangeLabel={rangeLabel}
                  customerFilter={builder.customerFilter}
                  canBuild={canBuild}
                  canSchedule={canSchedule}
                  hasRows={!!displayResult && displayResult.rows.length > 0}
                  onCustomize={() => setActive((a) => (a ? { ...a, builder: true } : a))}
                  onSave={openSave}
                  onSchedule={() => setSchedOpen(true)}
                  onDownloadCsv={download}
                  onExportPdf={() => setPdfOpen(true)}
                />

                {/* ── Configure & run ─────────────────────────────────────────── */}
                <ReportConfig
                  active={active}
                  dsMeta={builder.dsMeta}
                  datasets={builder.datasets}
                  setActive={setActive}
                  isAttendance={builder.isAttendance}
                  isDetail={isDetail}
                  members={builder.members}
                  tsCols={builder.tsCols}
                  setTsCols={builder.setTsCols}
                  toggleArr={builder.toggleArr}
                  hasCustomerDim={builder.hasCustomerDim}
                  customerFilter={builder.customerFilter}
                  setCustomerFilter={builder.setCustomerFilter}
                  customers={builder.customers}
                  patchDef={builder.patchDef}
                  runTimesheet={builder.runTimesheet}
                  runPending={builder.run.isPending}
                  timesheetPending={builder.timesheet.isPending}
                  onRun={() => builder.run.mutate(active.def)}
                />

                {!canBuild && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {t("reports.builderLocked", "Custom report builder is available on Professional and above.")}
                  </p>
                )}

                {/* ── Results ─────────────────────────────────────────────────── */}
                {displayResult && <ReportResults result={displayResult} isDetail={isDetail} />}
              </>
            )}
          </div>
        </div>
      </div>

      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        meta={saveMeta}
        onMetaChange={setSaveMeta}
        active={active}
        setActive={setActive}
        canBuild={canBuild}
      />

      <ScheduleDialog
        open={schedOpen}
        onOpenChange={setSchedOpen}
        savedId={active?.savedId}
        canSchedule={canSchedule}
      />

      {/* Full-screen PDF export studio — visual template gallery + live preview */}
      <ReportExportStudio
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        result={displayResult}
        meta={pdfMeta}
        branding={(orgProfile || {}) as ReportBranding}
        canCustom={canBuild}
        defaultName={active?.name}
      />
    </div>
  )
}
