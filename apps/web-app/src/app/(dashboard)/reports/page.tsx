"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { type ReportBranding } from "@/lib/report-pdf-options"
import { ReportExportStudio } from "@/components/reports/report-export-studio"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PageHeader, Panel } from "@/components/page/page-kit"
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
    <div className={PAGE_SHELL}>
      <PageHeader
        tour="reports-header"
        title={t("reports.title", "Reports")}
        subtitle={t("reports.subtitle", "Run reports on your team, jobs, tasks and customers.")}
        actions={
          <>
            {/* Job time — travel, working, blocked per job, beside the time on the clock. */}
            <Button asChild variant="outline" size="pill">
              <Link href="/reports/job-time">
                <Icon name="timer" size={16} /> {t("tasks.jobTime.reportTitle")}
              </Link>
            </Button>
            <Button size="pillLg" onClick={builder.newReport}>
              <Icon name="plus" size={18} /> {t("reports.builderNav", "Report builder")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[280px_minmax(0,1fr)]">
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
        <div className="flex min-w-0 flex-col gap-3.5">
          {!active ? (
            <Panel className="flex flex-col items-center px-6 py-16 text-center">
              <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-shell-accent-soft text-shell-accent">
                <Icon name="reports" size={24} />
              </span>
              <p className="text-base font-semibold text-foreground">
                {t("reports.pickOneTitle", "No report selected")}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                {t("reports.pickOne", "Pick a report on the left, or build a custom one.")}
              </p>
            </Panel>
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
                  <Icon name="lock" size={12} />
                  {t("reports.builderLocked", "Custom report builder is available on Professional and above.")}
                </p>
              )}

              {/* ── Results ─────────────────────────────────────────────────── */}
              {displayResult && <ReportResults result={displayResult} isDetail={isDetail} />}
            </>
          )}
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
