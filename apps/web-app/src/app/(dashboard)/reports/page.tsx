"use client"


import { type ReportBranding } from "@/lib/report-pdf-options";
import { ReportExportStudio } from "@/components/reports/report-export-studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useReportsPage } from "./_hooks/use-reports-page";
import { ReportsPageScheduleTitle } from "./_components/reports-page-schedule-title"
import { ReportsPageReports } from "./_components/reports-page-reports";

export default function ReportsPage() {
  const s = useReportsPage()
  const {
    t,
    canBuild,
    active,
    saveOpen,
    setSaveOpen,
    saveMeta,
    setSaveMeta,
    pdfOpen,
    setPdfOpen,
    orgProfile,
    save,
    pdfMeta,
    displayResult,
  } = s

  return (
    <div className="min-h-full bg-background">
      <ReportsPageReports vm={s} />

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{active?.savedId
            ? t("reports.updateTemplateTitle", "Update template")
            : t("reports.saveTemplateTitle", "Save as template")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div
              className="space-y-1.5"><Label
                className="text-xs">{t(
                  "reports.name",
                  "Name")} *</Label><Input
                    value={saveMeta.name}
                    onChange={(e) => setSaveMeta({ ...saveMeta, name: e.target.value })}
                    placeholder="Weekly overtime"
                  /></div>
            <div
              className="space-y-1.5"><Label
                className="text-xs">{t(
                  "reports.description",
                  "Description")}</Label><Input
                    value={saveMeta.description}
                    onChange={(e) => setSaveMeta({ ...saveMeta, description: e.target.value })}
                  /></div>
            <div
              className="flex items-center justify-between"><Label
                className="text-xs">{t(
                  "reports.shareOrg",
                  "Share with the whole organization")}</Label><Switch
                    checked={saveMeta.isShared}
                    onCheckedChange={(v) => setSaveMeta({ ...saveMeta, isShared: v })}
                  /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button
              disabled={!saveMeta.name.trim() || save.isPending}
              onClick={() => save.mutate()}>{save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <ReportsPageScheduleTitle s={s} />

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
